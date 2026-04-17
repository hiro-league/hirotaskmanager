import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  AUTH_SESSION_COOKIE_NAME,
  type AuthPrincipalType,
  type AuthSessionResponse,
} from "../shared/auth";
import type { BoardIndexEntry } from "../shared/models";
import { ansi, colorEnabled, paint } from "../shared/terminalColors";
import { resolveAuthDir } from "../shared/runtimeConfig";

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

function resolveAuthRootDir(): string {
  return resolveAuthDir();
}

function resolveAuthFilePath(): string {
  return path.join(resolveAuthRootDir(), "auth.json");
}

async function applyOwnerOnlyPermissions(targetPath: string): Promise<void> {
  if (process.platform === "win32") return;
  try {
    await chmod(targetPath, 0o600);
  } catch {
    // Best effort only; some filesystems may reject chmod semantics.
  }
}

async function ensureAuthDir(): Promise<void> {
  const dir = resolveAuthRootDir();
  await mkdir(dir, { recursive: true });
  if (process.platform === "win32") return;
  try {
    await chmod(dir, 0o700);
  } catch {
    // Best effort only; some filesystems may reject chmod semantics.
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function constantTimeHexEquals(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
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
  await applyOwnerOnlyPermissions(tmpPath);
  await rename(tmpPath, filePath);
  await applyOwnerOnlyPermissions(filePath);
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

export async function setupPassphrase(passphrase: string): Promise<void> {
  if (!passphrase) {
    throw new Error("Passphrase required");
  }
  const existing = await loadStoredAuthState();
  if (existing) {
    throw new Error("Auth already initialized");
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
    await applyOwnerOnlyPermissions(keyFilePath);
    wroteKeyFile = true;
  } catch {
    // Best-effort; fall through to console printing as a fallback.
  }

  // If writing the sidecar failed, always print. If it succeeded, only print
  // when stdout is a TTY (standalone foreground server); background/detached
  // spawns skip stdout to avoid duplicating what the launcher reads from file.
  if (!wroteKeyFile || process.stdout.isTTY) {
    printRecoveryKeyToConsole(recoveryKey);
  }
}

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
