import { chmod, mkdir } from "node:fs/promises";

/**
 * Apply 0o600 (owner read/write) to a file containing secrets. No-op on
 * Windows because POSIX mode bits don't translate; we still warn on POSIX
 * failures because any other error there means the secret is on disk with
 * the wrong permissions and the operator should know.
 *
 * Shared between `auth.json` (passphrase + recovery hashes) and
 * `cli-api-keys.json` (CLI key hashes) — both files live in the same auth
 * directory and have identical permission requirements.
 */
export async function applyOwnerOnlyFilePermissions(
  targetPath: string,
): Promise<void> {
  if (process.platform === "win32") return;
  try {
    await chmod(targetPath, 0o600);
  } catch (e) {
    console.warn(
      `[taskmanager] Warning: failed to chmod 600 on ${targetPath}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Ensure an auth/secrets directory exists with 0o700 (owner-only access).
 * Same Windows / POSIX rationale as {@link applyOwnerOnlyFilePermissions}.
 */
export async function ensureOwnerOnlyDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  if (process.platform === "win32") return;
  try {
    await chmod(dir, 0o700);
  } catch (e) {
    console.warn(
      `[taskmanager] Warning: failed to chmod 700 on ${dir}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
