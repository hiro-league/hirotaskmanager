/**
 * One-time bootstrap token that gates `POST /api/auth/setup` so the first
 * person to reach a fresh public-bind server cannot squat the passphrase
 * (task #31338). The launcher mints the token before the HTTP server starts
 * listening and prints it to the operator's terminal (the same trust channel
 * we use for the recovery key and CLI API keys). Anyone with network access
 * but no terminal access cannot read it.
 *
 * On-disk sidecar (`<authDir>/setup-token.tmp`) only ever stores the SHA-256
 * hash of the token, not the raw token. The raw value is returned exactly
 * once, by `mintSetupToken`, to its caller (the launcher). After a successful
 * `setupPassphrase` call we delete the sidecar so the token is single-use.
 */
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  applyOwnerOnlyFilePermissions,
  ensureOwnerOnlyDir,
} from "./secretsFs";
import { constantTimeHexEquals, sha256Hex } from "./cryptoHex";

const SETUP_TOKEN_FILENAME = "setup-token.tmp";
const SETUP_TOKEN_FILE_VERSION = 1;
/** Raw token byte length. 32 bytes = 64 hex chars; brute-forcing is infeasible. */
const SETUP_TOKEN_BYTES = 32;

export interface StoredSetupTokenState {
  version: 1;
  tokenHash: string;
  createdAt: string;
}

export function resolveSetupTokenFilePath(authDir: string): string {
  return path.join(authDir, SETUP_TOKEN_FILENAME);
}

function createRawSetupToken(): string {
  // URL-friendly, copy-safe, no padding. Hex would also work but base64url
  // keeps the printable token a bit shorter at the same entropy.
  return randomBytes(SETUP_TOKEN_BYTES).toString("base64url");
}

async function readStoredSetupTokenState(
  authDir: string,
): Promise<StoredSetupTokenState | null> {
  const filePath = resolveSetupTokenFilePath(authDir);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredSetupTokenState>;
    if (
      parsed?.version !== SETUP_TOKEN_FILE_VERSION ||
      typeof parsed.tokenHash !== "string" ||
      typeof parsed.createdAt !== "string"
    ) {
      throw new Error("Invalid setup-token sidecar");
    }
    return {
      version: SETUP_TOKEN_FILE_VERSION,
      tokenHash: parsed.tokenHash,
      createdAt: parsed.createdAt,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeStoredSetupTokenState(
  authDir: string,
  next: StoredSetupTokenState,
): Promise<void> {
  await ensureOwnerOnlyDir(authDir);
  const filePath = resolveSetupTokenFilePath(authDir);
  const tmpPath = `${filePath}.tmp`;
  const payload = `${JSON.stringify(next, null, 2)}\n`;
  await writeFile(tmpPath, payload, "utf8");
  await applyOwnerOnlyFilePermissions(tmpPath);
  await rename(tmpPath, filePath);
  await applyOwnerOnlyFilePermissions(filePath);
}

/**
 * Mint a fresh single-use setup token, persist its hash to disk, and return
 * the raw token. Overwrites any prior token sidecar — re-running the launcher
 * before setup completes always rotates the token so a stale value left over
 * from a previous boot can never be replayed.
 */
export async function mintSetupToken(authDir: string): Promise<string> {
  const rawToken = createRawSetupToken();
  await writeStoredSetupTokenState(authDir, {
    version: SETUP_TOKEN_FILE_VERSION,
    tokenHash: sha256Hex(rawToken),
    createdAt: new Date().toISOString(),
  });
  return rawToken;
}

/**
 * True iff a setup-token sidecar currently exists for this auth dir. Used by
 * the launcher to avoid noisy re-prints when something else (e.g. a parallel
 * `--setup-server` invocation) has already minted one.
 */
export async function hasSetupToken(authDir: string): Promise<boolean> {
  return (await readStoredSetupTokenState(authDir)) !== null;
}

/**
 * Validate a candidate token against the on-disk hash. Returns false (rather
 * than throwing) when no token exists so callers can map "missing" and
 * "wrong" to distinct error codes via `hasSetupToken`.
 */
export async function validateSetupToken(
  authDir: string,
  candidate: string,
): Promise<boolean> {
  if (!candidate) return false;
  const stored = await readStoredSetupTokenState(authDir);
  if (!stored) return false;
  return constantTimeHexEquals(sha256Hex(candidate), stored.tokenHash);
}

/**
 * Delete the setup-token sidecar (best-effort). Called from `setupPassphrase`
 * after a successful first-time setup so the token is single-use.
 */
export async function consumeSetupToken(authDir: string): Promise<void> {
  const filePath = resolveSetupTokenFilePath(authDir);
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
    // Surface non-ENOENT failures: leaving the file behind is a real
    // operational problem (the next launcher boot would mint a *second*
    // token while the old one is still valid on disk).
    throw error;
  }
}
