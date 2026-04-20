import { existsSync } from "node:fs";
import path from "node:path";
import type { ProfileRole } from "./runtimeConfig";

/**
 * Effective first-time server bootstrap phase. `passphrase_set` is derived from
 * on-disk auth + recovery-key sidecar (not persisted in profile config).
 * Initial development: no backward-compat layer beyond inferring `complete`
 * from existing auth.json when `server_setup_state` is absent.
 */
export type ServerSetupLifecycleState =
  | "profile_saved"
  | "passphrase_set"
  | "complete";

/** Persisted in server profile `config.json` (subset of {@link ServerSetupLifecycleState}). */
export type PersistedServerSetupState = "profile_saved" | "complete";

const AUTH_JSON = "auth.json";
const RECOVERY_KEY_TMP = "recovery-key.tmp";

/**
 * Resolve where the operator is in first-time server setup from profile config
 * plus auth directory contents. Single source of truth for launcher bootstrap.
 */
export function resolveEffectiveServerSetupLifecycleState(
  role: ProfileRole,
  persisted: PersistedServerSetupState | undefined,
  authDir: string,
): ServerSetupLifecycleState {
  if (role !== "server") {
    return "complete";
  }

  const authOk = existsSync(path.join(authDir, AUTH_JSON));
  const recPending = existsSync(path.join(authDir, RECOVERY_KEY_TMP));

  if (authOk && recPending) {
    return "passphrase_set";
  }
  if (authOk && !recPending) {
    return "complete";
  }

  // No auth.json yet — first-time passphrase not created.
  if (persisted === "complete") {
    // Config says done but auth is gone (deleted DB/auth) — treat as fresh bootstrap.
    return "profile_saved";
  }
  return "profile_saved";
}

/** True when the launcher should run mint/token/recovery ceremony (or part of it). */
export function needsInstalledBootstrapCeremony(
  state: ServerSetupLifecycleState,
): boolean {
  return state !== "complete";
}

/**
 * Value to persist in `server_setup_state` after saving server profile config.
 * Maps effective `complete` → `complete`; anything else → `profile_saved`.
 */
export function resolvePersistedServerSetupStateForConfigWrite(
  persisted: PersistedServerSetupState | undefined,
  authDir: string,
): PersistedServerSetupState {
  const eff = resolveEffectiveServerSetupLifecycleState(
    "server",
    persisted,
    authDir,
  );
  return eff === "complete" ? "complete" : "profile_saved";
}
