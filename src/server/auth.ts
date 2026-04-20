import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  applyOwnerOnlyFilePermissions,
  ensureOwnerOnlyDir,
} from "./secretsFs";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  AUTH_SESSION_COOKIE_NAME,
  type AuthPrincipalType,
  type AuthSessionResponse,
} from "../shared/auth";
import type { BoardIndexEntry } from "../shared/models";
import { ansi, colorEnabled, paint } from "../shared/terminalColors";
import {
  resolveAuthDir,
  resolveRequireCliApiKey,
} from "../shared/runtimeConfig";
import { constantTimeHexEquals, sha256Hex } from "./cryptoHex";
import { hasCliApiKeys, validateCliApiKey } from "./cliApiKeys";
import {
  consumeSetupToken,
  hasSetupToken,
  validateSetupToken,
} from "./setupToken";

interface StoredAuthState {
  version: 1;
  initializedAt: string;
  passphraseHash: string;
  recoveryKeyHash: string;
  activeSessionTokenHash: string | null;
}

export interface RequestAuthContext {
  initialized: boolean;
  principal: Exclude<AuthPrincipalType, "system">;
  authenticated: boolean;
}

export interface AppBindings {
  Variables: {
    auth: RequestAuthContext;
    boardEntry?: BoardIndexEntry;
  };
}

// Hono enforces Max-Age ≤ 400 days (RFC-style cap); longer values throw at setCookie.
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

let cachedAuthState: StoredAuthState | null | undefined;

/**
 * Clears the in-memory auth.json cache so tests can swap profiles or auth files on disk.
 * Production uses a single process-scoped profile; tests share the module and must reset.
 */
export function resetAuthDiskCacheForTests(): void {
  cachedAuthState = undefined;
}

function resolveAuthRootDir(): string {
  return resolveAuthDir();
}

function resolveAuthFilePath(): string {
  return path.join(resolveAuthRootDir(), "auth.json");
}

async function ensureAuthDir(): Promise<void> {
  await ensureOwnerOnlyDir(resolveAuthRootDir());
}

function normalizeRecoveryKeyInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function createRecoveryKey(): string {
  const raw = randomBytes(16).toString("hex").toUpperCase();
  return raw.match(/.{1,4}/g)?.join("-") ?? raw;
}

function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

async function readStoredAuthStateFromDisk(): Promise<StoredAuthState | null> {
  const filePath = resolveAuthFilePath();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredAuthState>;
    if (
      parsed?.version !== 1 ||
      typeof parsed.initializedAt !== "string" ||
      typeof parsed.passphraseHash !== "string" ||
      typeof parsed.recoveryKeyHash !== "string" ||
      !("activeSessionTokenHash" in parsed)
    ) {
      throw new Error("Invalid auth state");
    }
    return {
      version: 1,
      initializedAt: parsed.initializedAt,
      passphraseHash: parsed.passphraseHash,
      recoveryKeyHash: parsed.recoveryKeyHash,
      activeSessionTokenHash:
        typeof parsed.activeSessionTokenHash === "string"
          ? parsed.activeSessionTokenHash
          : null,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function loadStoredAuthState(): Promise<StoredAuthState | null> {
  if (cachedAuthState !== undefined) return cachedAuthState;
  cachedAuthState = await readStoredAuthStateFromDisk();
  return cachedAuthState;
}

async function writeStoredAuthState(next: StoredAuthState): Promise<void> {
  await ensureAuthDir();
  const filePath = resolveAuthFilePath();
  const tmpPath = `${filePath}.tmp`;
  const payload = `${JSON.stringify(next, null, 2)}\n`;
  await writeFile(tmpPath, payload, "utf8");
  await applyOwnerOnlyFilePermissions(tmpPath);
  await rename(tmpPath, filePath);
  await applyOwnerOnlyFilePermissions(filePath);
  cachedAuthState = next;
}

async function updateStoredAuthState(
  updater: (current: StoredAuthState) => StoredAuthState,
): Promise<StoredAuthState> {
  const current = await loadStoredAuthState();
  if (!current) {
    throw new Error("Auth not initialized");
  }
  const next = updater(current);
  await writeStoredAuthState(next);
  return next;
}

function isAuthRoute(pathname: string): boolean {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

function isSetupSafeRoute(pathname: string): boolean {
  return pathname === "/api/health" || isAuthRoute(pathname);
}

/** Routes that skip CLI Bearer enforcement (health checks, web session auth). Design §2.6. */
function isCliApiKeyExemptPath(pathname: string): boolean {
  if (pathname === "/api/health") return true;
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return true;
  return false;
}

function buildLoginRequiredResponse(c: Context<AppBindings>): Response {
  return c.json({ error: "Login required", code: "auth_login_required" }, 401);
}

function buildSetupRequiredResponse(c: Context<AppBindings>): Response {
  return c.json({ error: "TaskManager setup required", code: "auth_setup_required" }, 503);
}

// Treat the browser session cookie as the real security boundary so spoofable client
// headers only affect identity/provenance and never privileged access.
export const authMiddleware: MiddlewareHandler<AppBindings> = async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  const stored = await loadStoredAuthState();

  if (!stored) {
    c.set("auth", {
      initialized: false,
      principal: "cli",
      authenticated: false,
    });
    if (isSetupSafeRoute(pathname)) {
      await next();
      return;
    }
    return buildSetupRequiredResponse(c);
  }

  const sessionToken = getCookie(c, AUTH_SESSION_COOKIE_NAME) ?? "";
  const authenticated =
    !!stored.activeSessionTokenHash &&
    sessionToken.length > 0 &&
    constantTimeHexEquals(sha256Hex(sessionToken), stored.activeSessionTokenHash);

  c.set("auth", {
    initialized: true,
    principal: authenticated ? "web" : "cli",
    authenticated,
  });

  if (!authenticated && !isCliApiKeyExemptPath(pathname)) {
    const authDir = resolveAuthDir();
    const requireKey = resolveRequireCliApiKey();
    const bearerRaw =
      c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

    if (requireKey) {
      // Bootstrap caveat (design §2.6): when require_cli_api_key is true but
      // no keys are minted yet, surface auth_cli_key_required even if the
      // caller sent a Bearer — otherwise a typo'd key would shadow the real
      // "no keys exist; run `hirotaskmanager server api-key generate`" hint.
      if (!(await hasCliApiKeys(authDir))) {
        return c.json(
          {
            error: "CLI API key required",
            code: "auth_cli_key_required",
            hint: "No CLI API keys exist yet. Run `hirotaskmanager server api-key generate` on the server.",
          },
          401,
        );
      }
      if (!bearerRaw) {
        return c.json(
          { error: "CLI API key required", code: "auth_cli_key_required" },
          401,
        );
      }
      if (!(await validateCliApiKey(authDir, bearerRaw))) {
        return c.json(
          { error: "Invalid CLI API key", code: "auth_invalid_cli_key" },
          401,
        );
      }
    } else if (
      bearerRaw &&
      (await hasCliApiKeys(authDir)) &&
      !(await validateCliApiKey(authDir, bearerRaw))
    ) {
      return c.json(
        { error: "Invalid CLI API key", code: "auth_invalid_cli_key" },
        401,
      );
    }
  }

  await next();
};

export function getRequestAuthContext(c: Context<AppBindings>): RequestAuthContext {
  return c.get("auth");
}

export function requireWebSession(c: Context<AppBindings>): Response | undefined {
  const auth = getRequestAuthContext(c);
  if (!auth.initialized) return buildSetupRequiredResponse(c);
  if (!auth.authenticated) return buildLoginRequiredResponse(c);
  return undefined;
}

export async function getAuthSessionResponse(
  c: Context<AppBindings>,
): Promise<AuthSessionResponse> {
  const auth = getRequestAuthContext(c);
  return {
    initialized: auth.initialized,
    authenticated: auth.authenticated,
  };
}

/**
 * Distinguishable failures for `setupPassphrase` so the HTTP route can map
 * each to a stable machine-readable code/status without parsing message
 * text. Mirrors the `CLI_ERR.*` discriminator pattern used elsewhere.
 */
export type SetupPassphraseFailureCode =
  | "passphrase_required"
  | "auth_already_initialized"
  | "auth_setup_token_required"
  | "auth_invalid_setup_token";

export class SetupPassphraseError extends Error {
  readonly code: SetupPassphraseFailureCode;
  constructor(code: SetupPassphraseFailureCode, message: string) {
    super(message);
    this.code = code;
    this.name = "SetupPassphraseError";
  }
}

export interface SetupPassphraseInput {
  passphrase: string;
  setupToken: string;
}

export async function setupPassphrase(input: SetupPassphraseInput): Promise<void> {
  const { passphrase, setupToken } = input;
  if (!passphrase) {
    throw new SetupPassphraseError("passphrase_required", "Passphrase required");
  }
  const existing = await loadStoredAuthState();
  if (existing) {
    throw new SetupPassphraseError(
      "auth_already_initialized",
      "Auth already initialized",
    );
  }
  // Token gate (task #31338): without this, the first network caller to a
  // fresh public-bind server can squat the passphrase. The launcher mints a
  // single-use token before listening and prints it to the operator's
  // terminal — the same trust channel the recovery key already uses.
  const authDir = resolveAuthRootDir();
  if (!(await hasSetupToken(authDir))) {
    throw new SetupPassphraseError(
      "auth_setup_token_required",
      "Setup token required. Check the terminal running TaskManager for the one-time setup token.",
    );
  }
  if (!(await validateSetupToken(authDir, setupToken))) {
    throw new SetupPassphraseError(
      "auth_invalid_setup_token",
      "Invalid setup token.",
    );
  }
  const recoveryKey = createRecoveryKey();
  const next: StoredAuthState = {
    version: 1,
    initializedAt: new Date().toISOString(),
    passphraseHash: await Bun.password.hash(passphrase),
    recoveryKeyHash: sha256Hex(normalizeRecoveryKeyInput(recoveryKey)),
    activeSessionTokenHash: null,
  };
  await writeStoredAuthState(next);

  // Write the one-time key to a sidecar file so the launcher process can read
  // and display it even when the server runs as a detached child (avoids
  // cross-process stdout races on Windows).
  let wroteKeyFile = false;
  try {
    const keyFilePath = resolveRecoveryKeyFilePath();
    await writeFile(keyFilePath, recoveryKey, "utf8");
    await applyOwnerOnlyFilePermissions(keyFilePath);
    wroteKeyFile = true;
  } catch {
    // Best-effort; fall through to console printing as a fallback.
  }

  // Fix for task #31339: the sidecar is the single source of truth for the
  // launcher (and any other consumer) to display the key exactly once. The
  // previous TTY-based guard double-printed under `background-attached` mode
  // (detached child that still inherits the launcher's TTY): the server
  // printed once and the launcher then printed again from the sidecar. Only
  // fall back to console output when the sidecar write actually failed.
  if (!wroteKeyFile) {
    printRecoveryKeyToConsole(recoveryKey);
  }

  // Token is single-use (task #31338): delete the sidecar after a successful
  // setup so a leaked-then-reused token cannot reset the passphrase later.
  // `setupPassphrase` throws on `auth_already_initialized` afterwards, but
  // belt-and-braces — the absent sidecar means a stolen token also cannot be
  // used for any future bootstrap window if `auth.json` is somehow removed.
  await consumeSetupToken(authDir);
}

export { mintSetupToken } from "./setupToken";

/** Path to the one-time recovery key sidecar written during first setup. */
export function resolveRecoveryKeyFilePath(): string {
  return path.join(resolveAuthRootDir(), "recovery-key.tmp");
}

function printRecoveryKeyToConsole(recoveryKey: string): void {
  const o = process.stdout;
  if (colorEnabled(o)) {
    console.log(paint(o, "Recovery Key:", ansi.bold + ansi.yellow));
    console.log(paint(o, recoveryKey, ansi.cyan + ansi.bold));
    console.log(
      paint(
        o,
        "Store it on a separate device. It will never show again.",
        ansi.dim,
      ),
    );
    console.log(
      paint(
        o,
        "Use it to recover your passphrase and access your server/data.",
        ansi.dim,
      ),
    );
  } else {
    console.log("Recovery Key:");
    console.log(recoveryKey);
    console.log("Store it on a separate device. It will never show again.");
    console.log("Use it to recover your passphrase and access your server/data.");
  }
}

export async function loginWithPassphrase(passphrase: string): Promise<string | null> {
  const stored = await loadStoredAuthState();
  if (!stored) return null;
  const ok = await Bun.password.verify(passphrase, stored.passphraseHash);
  if (!ok) return null;
  const sessionToken = createSessionToken();
  await writeStoredAuthState({
    ...stored,
    activeSessionTokenHash: sha256Hex(sessionToken),
  });
  return sessionToken;
}

export async function resetPassphraseWithRecoveryKey(
  recoveryKey: string,
  nextPassphrase: string,
): Promise<boolean> {
  if (!nextPassphrase) {
    throw new Error("Passphrase required");
  }
  const stored = await loadStoredAuthState();
  if (!stored) return false;
  const recoveryKeyHash = sha256Hex(normalizeRecoveryKeyInput(recoveryKey));
  if (!constantTimeHexEquals(recoveryKeyHash, stored.recoveryKeyHash)) {
    return false;
  }
  await writeStoredAuthState({
    ...stored,
    passphraseHash: await Bun.password.hash(nextPassphrase),
    activeSessionTokenHash: null,
  });
  return true;
}

export async function clearActiveSession(): Promise<void> {
  await updateStoredAuthState((current) => ({
    ...current,
    activeSessionTokenHash: null,
  }));
}

export function setAuthSessionCookie(c: Context, sessionToken: string): void {
  const url = new URL(c.req.url);
  setCookie(c, AUTH_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
    secure: url.protocol === "https:",
  });
}

export function clearAuthSessionCookie(c: Context): void {
  deleteCookie(c, AUTH_SESSION_COOKIE_NAME, {
    path: "/",
  });
}
