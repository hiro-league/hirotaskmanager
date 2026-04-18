import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import {
  authMiddleware,
  resetAuthDiskCacheForTests,
  type AppBindings,
} from "./auth";
import {
  generateCliApiKey,
  resetCliApiKeysCacheForTests,
} from "./cliApiKeys";
import { setRuntimeConfigSelection } from "../shared/runtimeConfig";
import { INSTALLED_DEFAULT_PORT } from "../shared/ports";

const PROFILE = "mwtest";
// HOME is overridden by the bun-test-setup preload's beforeAll, so paths must
// be resolved lazily after that hook runs (capturing process.env.HOME at module
// top level points at the developer's real ~/.taskmanager).
let profileDir: string;
let authDir: string;
let dataDir: string;

let bearerKey: string;

describe("authMiddleware (CLI API key)", () => {
  beforeAll(async () => {
    const home = process.env.HOME!;
    profileDir = path.join(home, ".taskmanager", "profiles", PROFILE);
    authDir = path.join(profileDir, "auth");
    dataDir = path.join(profileDir, "data");
    mkdirSync(authDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      path.join(authDir, "auth.json"),
      `${JSON.stringify(
        {
          version: 1,
          initializedAt: "2020-01-01T00:00:00.000Z",
          passphraseHash: "a".repeat(64),
          recoveryKeyHash: "b".repeat(64),
          activeSessionTokenHash: null,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const { key } = await generateCliApiKey({ authDir, label: "mw" });
    bearerKey = key;
    writeFileSync(
      path.join(profileDir, "config.json"),
      `${JSON.stringify(
        {
          role: "server",
          port: INSTALLED_DEFAULT_PORT,
          data_dir: dataDir,
          auth_dir: authDir,
          bind_address: "127.0.0.1",
          require_cli_api_key: true,
          api_key: key,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  });

  beforeEach(() => {
    resetAuthDiskCacheForTests();
    resetCliApiKeysCacheForTests();
    setRuntimeConfigSelection({ profile: PROFILE, kind: "installed" });
  });

  afterEach(() => {
    resetAuthDiskCacheForTests();
    resetCliApiKeysCacheForTests();
    setRuntimeConfigSelection({ profile: "default" });
  });

  test("returns 401 auth_cli_key_required without Bearer on non-exempt /api routes", async () => {
    const app = new Hono<AppBindings>();
    app.use("/api/*", authMiddleware);
    app.get("/api/smoke", (c) => c.json({ ok: true }));

    const res = await app.request("http://localhost/api/smoke", {
      method: "GET",
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("auth_cli_key_required");
  });

  test("allows non-exempt /api routes with valid Bearer token", async () => {
    const app = new Hono<AppBindings>();
    app.use("/api/*", authMiddleware);
    app.get("/api/smoke", (c) => c.json({ ok: true }));

    const res = await app.request("http://localhost/api/smoke", {
      method: "GET",
      headers: { Authorization: `Bearer ${bearerKey}` },
    });
    expect(res.status).toBe(200);
  });

  test("returns 401 auth_invalid_cli_key when Bearer does not match stored keys", async () => {
    const app = new Hono<AppBindings>();
    app.use("/api/*", authMiddleware);
    app.get("/api/smoke", (c) => c.json({ ok: true }));

    const res = await app.request("http://localhost/api/smoke", {
      method: "GET",
      headers: {
        Authorization: `Bearer tmk-${"0".repeat(64)}`,
      },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("auth_invalid_cli_key");
  });
});

// Bootstrap caveat (design §2.6): when require_cli_api_key=true but no keys
// have been minted yet, every CLI request should report auth_cli_key_required
// (with a hint to mint a key) rather than auth_invalid_cli_key, even if the
// caller happens to send a Bearer header.
const BOOTSTRAP_PROFILE = "mwtest-bootstrap";
// Same lazy-resolution rationale as the mwtest paths above: HOME is rewritten
// by the bun-test-setup preload's beforeAll hook.
let bootstrapProfileDir: string;
let bootstrapAuthDir: string;
let bootstrapDataDir: string;

describe("authMiddleware (bootstrap: no keys minted)", () => {
  beforeAll(() => {
    const home = process.env.HOME!;
    bootstrapProfileDir = path.join(
      home,
      ".taskmanager",
      "profiles",
      BOOTSTRAP_PROFILE,
    );
    bootstrapAuthDir = path.join(bootstrapProfileDir, "auth");
    bootstrapDataDir = path.join(bootstrapProfileDir, "data");
    mkdirSync(bootstrapAuthDir, { recursive: true });
    mkdirSync(bootstrapDataDir, { recursive: true });
    writeFileSync(
      path.join(bootstrapAuthDir, "auth.json"),
      `${JSON.stringify(
        {
          version: 1,
          initializedAt: "2020-01-01T00:00:00.000Z",
          passphraseHash: "a".repeat(64),
          recoveryKeyHash: "b".repeat(64),
          activeSessionTokenHash: null,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    writeFileSync(
      path.join(bootstrapProfileDir, "config.json"),
      `${JSON.stringify(
        {
          role: "server",
          port: INSTALLED_DEFAULT_PORT + 1,
          data_dir: bootstrapDataDir,
          auth_dir: bootstrapAuthDir,
          bind_address: "127.0.0.1",
          require_cli_api_key: true,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  });

  beforeEach(() => {
    resetAuthDiskCacheForTests();
    setRuntimeConfigSelection({ profile: BOOTSTRAP_PROFILE, kind: "installed" });
  });

  afterEach(() => {
    resetAuthDiskCacheForTests();
    setRuntimeConfigSelection({ profile: "default" });
  });

  test("returns auth_cli_key_required when no Bearer is sent and no keys exist", async () => {
    const app = new Hono<AppBindings>();
    app.use("/api/*", authMiddleware);
    app.get("/api/smoke", (c) => c.json({ ok: true }));
    const res = await app.request("http://localhost/api/smoke");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string; hint?: string };
    expect(body.code).toBe("auth_cli_key_required");
    expect(body.hint).toContain("api-key generate");
  });

  test("returns auth_cli_key_required even when a Bearer is sent and no keys exist", async () => {
    const app = new Hono<AppBindings>();
    app.use("/api/*", authMiddleware);
    app.get("/api/smoke", (c) => c.json({ ok: true }));
    const res = await app.request("http://localhost/api/smoke", {
      headers: { Authorization: `Bearer tmk-${"0".repeat(64)}` },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("auth_cli_key_required");
  });
});
