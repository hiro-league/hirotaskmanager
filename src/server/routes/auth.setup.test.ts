import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { existsSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { authRoute } from "./auth";
import {
  authMiddleware,
  resetAuthDiskCacheForTests,
  type AppBindings,
} from "../auth";
import {
  mintSetupToken,
  resolveSetupTokenFilePath,
} from "../setupToken";
import { resetCliApiKeysCacheForTests } from "../cliApiKeys";
import { setRuntimeConfigSelection } from "../../shared/runtimeConfig";
import { INSTALLED_DEFAULT_PORT } from "../../shared/ports";
import { writeFileSync } from "node:fs";

const PROFILE = "setup-token-test";
let profileDir: string;
let authDir: string;
let dataDir: string;

function buildApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();
  app.use("/api/*", authMiddleware);
  app.route("/api/auth", authRoute);
  return app;
}

function clearAuthState(): void {
  // Each test owns the on-disk state; reset between tests so previous
  // mint/consume calls do not leak.
  for (const file of ["auth.json", "setup-token.tmp", "recovery-key.tmp"]) {
    const p = path.join(authDir, file);
    if (existsSync(p)) {
      try {
        unlinkSync(p);
      } catch {
        // best-effort
      }
    }
  }
  resetAuthDiskCacheForTests();
}

describe("POST /api/auth/setup (setup-token gate, task #31338)", () => {
  beforeAll(() => {
    const home = process.env.HOME!;
    profileDir = path.join(home, ".taskmanager", "profiles", PROFILE);
    authDir = path.join(profileDir, "auth");
    dataDir = path.join(profileDir, "data");
    mkdirSync(authDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      path.join(profileDir, "config.json"),
      `${JSON.stringify(
        {
          role: "server",
          port: INSTALLED_DEFAULT_PORT + 2,
          data_dir: dataDir,
          bind_address: "127.0.0.1",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  });

  beforeEach(() => {
    clearAuthState();
    resetCliApiKeysCacheForTests();
    setRuntimeConfigSelection({ profile: PROFILE, kind: "installed" });
  });

  afterEach(() => {
    clearAuthState();
    setRuntimeConfigSelection({ profile: "default" });
  });

  test("rejects setup with no token (no sidecar minted) -> 401 auth_setup_token_required", async () => {
    const res = await buildApp().request("http://localhost/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: "hunter2-hunter2" }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string; hint?: string };
    expect(body.code).toBe("auth_setup_token_required");
    expect(body.hint).toContain("terminal");
  });

  test("rejects setup with a bogus token when one was minted -> 401 auth_invalid_setup_token", async () => {
    await mintSetupToken(authDir);
    const res = await buildApp().request("http://localhost/api/auth/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer not-the-real-token",
      },
      body: JSON.stringify({ passphrase: "hunter2-hunter2" }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("auth_invalid_setup_token");
  });

  test("accepts setup with the minted token, then deletes the sidecar (single-use)", async () => {
    const token = await mintSetupToken(authDir);
    const app = buildApp();

    const ok = await app.request("http://localhost/api/auth/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ passphrase: "hunter2-hunter2" }),
    });
    expect(ok.status).toBe(201);
    const okBody = (await ok.json()) as { ok?: boolean };
    expect(okBody.ok).toBe(true);

    // Sidecar consumed.
    expect(existsSync(resolveSetupTokenFilePath(authDir))).toBe(false);

    // Replay with the same token now fails because (a) auth is initialized and
    // (b) the sidecar is gone.
    const replay = await app.request("http://localhost/api/auth/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ passphrase: "hunter2-hunter2" }),
    });
    expect(replay.status).toBe(409);
    const replayBody = (await replay.json()) as { code?: string };
    expect(replayBody.code).toBe("auth_already_initialized");

    // Cleanup so the next test starts from a fresh state.
    const authJsonPath = path.join(authDir, "auth.json");
    if (existsSync(authJsonPath)) rmSync(authJsonPath);
  });

  test("rejects empty passphrase even when the token is valid", async () => {
    const token = await mintSetupToken(authDir);
    const res = await buildApp().request("http://localhost/api/auth/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ passphrase: "" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("passphrase_required");
  });
});
