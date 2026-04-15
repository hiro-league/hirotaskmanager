import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveRuntimeSource } from "./runtimeIdentity";

describe("resolveRuntimeSource", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const tempRoot of tempRoots.splice(0)) {
      try {
        rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        /* Windows may briefly keep temp files open */
      }
    }
  });

  test("reports repo when the package root contains .git", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "runtime-source-repo-"));
    tempRoots.push(tempRoot);
    const srcDir = path.join(tempRoot, "src", "server");
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(path.join(tempRoot, ".git"), { recursive: true });
    writeFileSync(path.join(tempRoot, "package.json"), "{}\n");
    writeFileSync(path.join(srcDir, "index.ts"), "export {};\n");

    expect(
      resolveRuntimeSource(pathToFileURL(path.join(srcDir, "index.ts")).href),
    ).toBe("repo");
  });

  test("reports installed when the package root has no .git", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "runtime-source-installed-"));
    tempRoots.push(tempRoot);
    const srcDir = path.join(tempRoot, "src", "server");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(tempRoot, "package.json"), "{}\n");
    writeFileSync(path.join(srcDir, "index.ts"), "export {};\n");

    expect(
      resolveRuntimeSource(pathToFileURL(path.join(srcDir, "index.ts")).href),
    ).toBe("installed");
  });
});
