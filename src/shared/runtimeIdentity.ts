import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeKind } from "./runtimeConfig";

export type RuntimeSource = "repo" | "installed";

export interface RuntimeIdentity {
  kind: RuntimeKind;
  source: RuntimeSource;
}

function findPackageRoot(startDir: string): string {
  let currentDir = path.resolve(startDir);

  for (;;) {
    if (existsSync(path.join(currentDir, "package.json"))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return startDir;
    }
    currentDir = parentDir;
  }
}

export function resolveRuntimeSource(fromMetaUrl: string = import.meta.url): RuntimeSource {
  const sourceFilePath = fileURLToPath(fromMetaUrl);
  const packageRoot = findPackageRoot(path.dirname(sourceFilePath));
  // The repo checkout includes `.git`; packed/global installs do not. This keeps
  // runtime/source reporting aligned with the user's repo-vs-installed question.
  return existsSync(path.join(packageRoot, ".git")) ? "repo" : "installed";
}
