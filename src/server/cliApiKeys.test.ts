import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CLI_API_KEYS_FILE_NAME,
  generateCliApiKey,
  hasCliApiKeys,
  listCliApiKeyRecords,
  readCliApiKeysFile,
  resetCliApiKeysCacheForTests,
  revokeCliApiKeyByPrefix,
  validateCliApiKey,
  writeCliApiKeysFile,
} from "./cliApiKeys";

function freshAuthDir(): string {
  return mkdtempSync(path.join(tmpdir(), "tm-clikeys-"));
}

describe("cliApiKeys", () => {
  beforeEach(() => {
    resetCliApiKeysCacheForTests();
  });
  afterEach(() => {
    resetCliApiKeysCacheForTests();
  });

  test("generate stores a tmk- key and validates by hash", async () => {
    const authDir = freshAuthDir();
    const { key, record } = await generateCliApiKey({
      authDir,
      label: "unit",
    });
    expect(key).toMatch(/^tmk-[0-9a-f]{64}$/);
    expect(record.id).toBe(key.slice(0, 8));
    expect(record.label).toBe("unit");
    expect(record.hash.length).toBeGreaterThan(0);
    expect(await validateCliApiKey(authDir, key)).toBe(true);
    expect(await validateCliApiKey(authDir, `${key}x`)).toBe(false);
  });

  test("hasCliApiKeys reflects current state and updates after revoke", async () => {
    const authDir = freshAuthDir();
    expect(await hasCliApiKeys(authDir)).toBe(false);
    const { record } = await generateCliApiKey({ authDir });
    expect(await hasCliApiKeys(authDir)).toBe(true);
    await revokeCliApiKeyByPrefix(authDir, record.id);
    expect(await hasCliApiKeys(authDir)).toBe(false);
  });

  test("list and revoke by prefix", async () => {
    const authDir = freshAuthDir();
    const { key, record } = await generateCliApiKey({ authDir });
    const listed = await listCliApiKeyRecords(authDir);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe(record.id);

    const revoked = await revokeCliApiKeyByPrefix(authDir, record.id);
    expect(revoked.id).toBe(record.id);
    expect(await listCliApiKeyRecords(authDir)).toHaveLength(0);
    expect(await validateCliApiKey(authDir, key)).toBe(false);
  });

  test("revoke rejects missing prefix with descriptive error", async () => {
    const authDir = freshAuthDir();
    await generateCliApiKey({ authDir, label: "a" });
    await generateCliApiKey({ authDir, label: "b" });
    await expect(revokeCliApiKeyByPrefix(authDir, "nope")).rejects.toThrow(
      /No key matches/,
    );
  });

  test("revoke rejects ambiguous prefix when multiple ids share it", async () => {
    // Force two records that share an id prefix by writing the file directly,
    // since random ids almost never collide. This exercises the
    // "ambiguous (N matches); use a longer prefix" branch.
    const authDir = freshAuthDir();
    await writeCliApiKeysFile(authDir, {
      version: 1,
      keys: [
        {
          id: "tmk-aaaa",
          hash: "a".repeat(64),
          label: "first",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
        {
          id: "tmk-aaab",
          hash: "b".repeat(64),
          label: "second",
          createdAt: "2025-01-02T00:00:00.000Z",
        },
      ],
    });
    await expect(revokeCliApiKeyByPrefix(authDir, "tmk-aaa")).rejects.toThrow(
      /ambiguous \(2 matches\)/,
    );
  });

  test("revoke rejects too-short prefix (<4 chars)", async () => {
    const authDir = freshAuthDir();
    await generateCliApiKey({ authDir });
    await expect(revokeCliApiKeyByPrefix(authDir, "tm")).rejects.toThrow(
      /at least 4 characters/,
    );
  });

  test("revoke errors when no keys are registered", async () => {
    const authDir = freshAuthDir();
    await expect(revokeCliApiKeyByPrefix(authDir, "tmk-aaaa")).rejects.toThrow(
      /No CLI API keys are registered/,
    );
  });

  test("write is atomic: no leftover .tmp file after success", async () => {
    const authDir = freshAuthDir();
    await generateCliApiKey({ authDir });
    const entries = readdirSync(authDir);
    // The atomic write path is `cli-api-keys.json.tmp` → rename →
    // `cli-api-keys.json`. After a successful write, only the final file
    // should be on disk.
    expect(entries).toContain(CLI_API_KEYS_FILE_NAME);
    expect(
      entries.some((name) => name.endsWith(".tmp")),
    ).toBe(false);
    expect(
      existsSync(path.join(authDir, `${CLI_API_KEYS_FILE_NAME}.tmp`)),
    ).toBe(false);
  });

  test("corrupted JSON throws (no silent fallback to empty list)", async () => {
    const authDir = freshAuthDir();
    writeFileSync(
      path.join(authDir, CLI_API_KEYS_FILE_NAME),
      "{ this is not valid json",
      "utf8",
    );
    await expect(readCliApiKeysFile(authDir)).rejects.toThrow();
  });

  test("invalid shape (missing keys array) throws", async () => {
    const authDir = freshAuthDir();
    writeFileSync(
      path.join(authDir, CLI_API_KEYS_FILE_NAME),
      `${JSON.stringify({ version: 1 })}\n`,
      "utf8",
    );
    await expect(readCliApiKeysFile(authDir)).rejects.toThrow(
      /Invalid cli-api-keys\.json shape/,
    );
  });

  test("unsupported version throws", async () => {
    const authDir = freshAuthDir();
    writeFileSync(
      path.join(authDir, CLI_API_KEYS_FILE_NAME),
      `${JSON.stringify({ version: 2, keys: [] })}\n`,
      "utf8",
    );
    await expect(readCliApiKeysFile(authDir)).rejects.toThrow(
      /Invalid cli-api-keys\.json shape/,
    );
  });

  test("cache returns the post-write state to subsequent calls without rereading disk", async () => {
    const authDir = freshAuthDir();
    const { key } = await generateCliApiKey({ authDir });
    // Bypass writeCliApiKeysFile and corrupt the file on disk: the cache
    // should still serve the in-memory snapshot, proving validate() is not
    // re-reading disk per request.
    writeFileSync(
      path.join(authDir, CLI_API_KEYS_FILE_NAME),
      "garbage that would otherwise throw",
      "utf8",
    );
    expect(await validateCliApiKey(authDir, key)).toBe(true);
    // After explicit cache reset, the disk corruption surfaces.
    resetCliApiKeysCacheForTests();
    await expect(validateCliApiKey(authDir, key)).rejects.toThrow();
  });

  test("write invalidates cache so subsequent reads see the new state", async () => {
    const authDir = freshAuthDir();
    const { record: a } = await generateCliApiKey({ authDir, label: "a" });
    expect((await listCliApiKeyRecords(authDir)).map((r) => r.id)).toEqual([
      a.id,
    ]);
    const { record: b } = await generateCliApiKey({ authDir, label: "b" });
    expect((await listCliApiKeyRecords(authDir)).map((r) => r.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );
  });
});
