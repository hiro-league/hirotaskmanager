import { describe, expect, test, beforeEach } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  consumeSetupToken,
  hasSetupToken,
  mintSetupToken,
  resolveSetupTokenFilePath,
  validateSetupToken,
} from "./setupToken";

describe("setupToken", () => {
  let authDir: string;

  beforeEach(() => {
    authDir = mkdtempSync(path.join(tmpdir(), "tm-setup-token-"));
  });

  test("mintSetupToken returns a non-empty raw token and writes a sidecar", async () => {
    const token = await mintSetupToken(authDir);
    expect(token.length).toBeGreaterThan(20);
    expect(existsSync(resolveSetupTokenFilePath(authDir))).toBe(true);
    expect(await hasSetupToken(authDir)).toBe(true);
  });

  test("sidecar stores only the SHA-256 hash, never the raw token", async () => {
    const token = await mintSetupToken(authDir);
    const raw = readFileSync(resolveSetupTokenFilePath(authDir), "utf8");
    expect(raw).not.toContain(token);
    const parsed = JSON.parse(raw) as {
      version: number;
      tokenHash: string;
      createdAt: string;
    };
    expect(parsed.version).toBe(1);
    expect(parsed.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof parsed.createdAt).toBe("string");
  });

  test("validateSetupToken accepts the minted token and rejects a wrong one", async () => {
    const token = await mintSetupToken(authDir);
    expect(await validateSetupToken(authDir, token)).toBe(true);
    expect(await validateSetupToken(authDir, `${token}x`)).toBe(false);
    expect(await validateSetupToken(authDir, "")).toBe(false);
  });

  test("validateSetupToken returns false (not throws) when no sidecar exists", async () => {
    expect(await validateSetupToken(authDir, "anything")).toBe(false);
    expect(await hasSetupToken(authDir)).toBe(false);
  });

  test("re-minting rotates the token: previous token no longer validates", async () => {
    const first = await mintSetupToken(authDir);
    const second = await mintSetupToken(authDir);
    expect(first).not.toBe(second);
    expect(await validateSetupToken(authDir, first)).toBe(false);
    expect(await validateSetupToken(authDir, second)).toBe(true);
  });

  test("consumeSetupToken deletes the sidecar and is idempotent on missing files", async () => {
    await mintSetupToken(authDir);
    await consumeSetupToken(authDir);
    expect(existsSync(resolveSetupTokenFilePath(authDir))).toBe(false);
    await consumeSetupToken(authDir);
    expect(existsSync(resolveSetupTokenFilePath(authDir))).toBe(false);
  });

  test("validateSetupToken throws on a corrupt sidecar so silent acceptance is impossible", async () => {
    writeFileSync(resolveSetupTokenFilePath(authDir), "not json", "utf8");
    await expect(validateSetupToken(authDir, "anything")).rejects.toThrow();
  });
});
