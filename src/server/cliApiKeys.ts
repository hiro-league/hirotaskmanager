import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { constantTimeHexEquals, sha256Hex } from "./cryptoHex";
import {
  applyOwnerOnlyFilePermissions,
  ensureOwnerOnlyDir,
} from "./secretsFs";

export const CLI_API_KEYS_FILE_NAME = "cli-api-keys.json";

export interface CliApiKeyRecord {
  id: string;
  hash: string;
  label: string;
  createdAt: string;
}

export interface CliApiKeysFile {
  version: 1;
  keys: CliApiKeyRecord[];
}

function resolveCliApiKeysPath(authDir: string): string {
  return path.join(authDir, CLI_API_KEYS_FILE_NAME);
}

// Per-authDir cache. authMiddleware reads cli-api-keys.json on every non-exempt
// /api/* request; without this we issue 1-2 disk reads per call. The cache
// snapshot is a deep-cloned object so callers can't mutate the cached array
// (issue #12 follow-up: the previous code did fs.readFile every request).
type CliApiKeysCacheEntry =
  | { state: "missing" }
  | { state: "present"; data: CliApiKeysFile };
const cliApiKeysCache = new Map<string, CliApiKeysCacheEntry>();

function cloneFile(data: CliApiKeysFile): CliApiKeysFile {
  return {
    version: 1,
    keys: data.keys.map((k) => ({ ...k })),
  };
}

function setCacheMissing(authDir: string): void {
  cliApiKeysCache.set(authDir, { state: "missing" });
}

function setCachePresent(authDir: string, data: CliApiKeysFile): void {
  cliApiKeysCache.set(authDir, { state: "present", data: cloneFile(data) });
}

function getCached(authDir: string): CliApiKeysFile | null | undefined {
  const entry = cliApiKeysCache.get(authDir);
  if (!entry) return undefined;
  if (entry.state === "missing") return null;
  return cloneFile(entry.data);
}

/** Test-only cache reset; production never mutates the auth dir from outside this module. */
export function resetCliApiKeysCacheForTests(): void {
  cliApiKeysCache.clear();
}

export async function readCliApiKeysFile(
  authDir: string,
): Promise<CliApiKeysFile | null> {
  const cached = getCached(authDir);
  if (cached !== undefined) return cached;

  const filePath = resolveCliApiKeysPath(authDir);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<CliApiKeysFile>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.keys)) {
      throw new Error("Invalid cli-api-keys.json shape");
    }
    const data: CliApiKeysFile = {
      version: 1,
      keys: parsed.keys as CliApiKeyRecord[],
    };
    setCachePresent(authDir, data);
    return cloneFile(data);
  } catch (e) {
    // ENOENT = file or any parent is missing; ENOTDIR = a path component the
    // operator pointed at is a file, not a directory. Both mean "no keys
    // exist for this auth dir" from the middleware's perspective, and we want
    // the friendly auth_cli_key_required hint instead of a 500.
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      setCacheMissing(authDir);
      return null;
    }
    throw e;
  }
}

export async function writeCliApiKeysFile(
  authDir: string,
  data: CliApiKeysFile,
): Promise<void> {
  await ensureOwnerOnlyDir(authDir);
  const filePath = resolveCliApiKeysPath(authDir);
  const tmpPath = `${filePath}.tmp`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(tmpPath, payload, "utf8");
  await applyOwnerOnlyFilePermissions(tmpPath);
  await rename(tmpPath, filePath);
  await applyOwnerOnlyFilePermissions(filePath);
  setCachePresent(authDir, data);
}

export async function hasCliApiKeys(authDir: string): Promise<boolean> {
  const state = await readCliApiKeysFile(authDir);
  return !!state?.keys.length;
}

/**
 * Validates a raw Bearer token against stored SHA-256 hashes (constant-time per entry).
 */
export async function validateCliApiKey(
  authDir: string,
  rawKey: string,
): Promise<boolean> {
  const state = await readCliApiKeysFile(authDir);
  if (!state?.keys.length) return false;
  const digest = sha256Hex(rawKey);
  for (const row of state.keys) {
    if (constantTimeHexEquals(digest, row.hash)) return true;
  }
  return false;
}

function makeKeyString(): string {
  const hex = randomBytes(32).toString("hex");
  return `tmk-${hex}`;
}

export async function generateCliApiKey(options: {
  authDir: string;
  label?: string;
}): Promise<{ key: string; record: CliApiKeyRecord }> {
  const key = makeKeyString();
  const id = key.slice(0, 8);
  const record: CliApiKeyRecord = {
    id,
    hash: sha256Hex(key),
    label: options.label?.trim() ?? "",
    createdAt: new Date().toISOString(),
  };
  const prev = (await readCliApiKeysFile(options.authDir)) ?? {
    version: 1 as const,
    keys: [] as CliApiKeyRecord[],
  };
  const next: CliApiKeysFile = {
    version: 1,
    keys: [...prev.keys, record],
  };
  await writeCliApiKeysFile(options.authDir, next);
  return { key, record };
}

export async function listCliApiKeyRecords(
  authDir: string,
): Promise<CliApiKeyRecord[]> {
  const state = await readCliApiKeysFile(authDir);
  return state?.keys ?? [];
}

// Minimum prefix length when revoking keys. Generated ids are 8 chars
// (e.g. `tmk-a3f8`); requiring >=4 keeps revocation unambiguous in practice
// while still letting operators copy a short, readable substring.
const REVOKE_PREFIX_MIN_LENGTH = 4;

export async function revokeCliApiKeyByPrefix(
  authDir: string,
  prefixRaw: string,
): Promise<CliApiKeyRecord> {
  const prefix = prefixRaw.trim().toLowerCase();
  if (prefix.length < REVOKE_PREFIX_MIN_LENGTH) {
    throw new Error(
      `Revocation prefix must be at least ${REVOKE_PREFIX_MIN_LENGTH} characters`,
    );
  }
  const state = await readCliApiKeysFile(authDir);
  if (!state?.keys.length) {
    throw new Error("No CLI API keys are registered");
  }
  // startsWith subsumes equality; the prior `=== prefix || startsWith(prefix)`
  // pair was redundant (issue #11).
  const matches = state.keys.filter((k) =>
    k.id.toLowerCase().startsWith(prefix),
  );
  if (matches.length === 0) {
    throw new Error(`No key matches prefix "${prefixRaw.trim()}"`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Prefix "${prefixRaw.trim()}" is ambiguous (${matches.length} matches); use a longer prefix`,
    );
  }
  const revoked = matches[0]!;
  const nextKeys = state.keys.filter((k) => k.id !== revoked.id);
  await writeCliApiKeysFile(authDir, { version: 1, keys: nextKeys });
  return revoked;
}
