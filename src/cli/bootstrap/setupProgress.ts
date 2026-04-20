/**
 * Tracks what the operator has actually accomplished during a single
 * `hirotaskmanager` setup run, so that an interrupted run (Ctrl+C) can
 * truthfully report what is already on disk and what is still missing.
 *
 * This is intentionally not granular per-side-effect — phases mirror the
 * existing write call sites in setupWizards.ts and launcher.ts:
 *   profile_written       <- writeConfigFile in either wizard
 *   default_pointer_set   <- writeDefaultProfileName
 *   api_key_minted        <- generateCliApiKey + writeConfigFile (server wizard)
 *   server_started        <- startServer onReady (foreground/background-attached)
 *   awaiting_recovery_key <- launcher just before the recovery-key Enter pause
 *
 * Plus `chose_role` for the pre-wizard role choice and `currentPromptLabel` to
 * say which question we were waiting on at the moment of interrupt.
 */

export type SetupPhase =
  | "chose_role"
  | "profile_written"
  | "default_pointer_set"
  | "api_key_minted"
  | "server_started"
  | "awaiting_recovery_key";

export type SetupRole = "server" | "client";

export interface SetupProgressSnapshot {
  readonly role: SetupRole | null;
  readonly profileName: string | null;
  readonly phases: ReadonlySet<SetupPhase>;
  readonly currentPromptLabel: string | null;
  readonly serverUrl: string | null;
}

export interface SetupProgress {
  setRole(role: SetupRole): void;
  setProfileName(name: string): void;
  setServerUrl(url: string): void;
  mark(phase: SetupPhase): void;
  setCurrentPromptLabel(label: string | null): void;
  snapshot(): SetupProgressSnapshot;
}

export function createSetupProgress(): SetupProgress {
  let role: SetupRole | null = null;
  let profileName: string | null = null;
  let serverUrl: string | null = null;
  const phases = new Set<SetupPhase>();
  let currentPromptLabel: string | null = null;

  return {
    setRole(next) {
      role = next;
      phases.add("chose_role");
    },
    setProfileName(name) {
      profileName = name;
    },
    setServerUrl(url) {
      serverUrl = url;
    },
    mark(phase) {
      phases.add(phase);
    },
    setCurrentPromptLabel(label) {
      currentPromptLabel = label;
    },
    snapshot() {
      return {
        role,
        profileName,
        phases: new Set(phases),
        currentPromptLabel,
        serverUrl,
      };
    },
  };
}

export interface SetupAbortBullets {
  /** What the operator has already accomplished. May be empty. */
  done: string[];
  /** What an abort right now will leave unfinished. May be empty. */
  notDone: string[];
}

/**
 * Build the "what is done / what is not done" bullets for the abort preview.
 *
 * Rules:
 *  - Server flow milestones: profile_written, [api_key_minted],
 *    default_pointer_set, server_started, awaiting_recovery_key.
 *  - Client flow milestones: profile_written, default_pointer_set.
 *  - We only mention api_key_minted on the server flow because the client
 *    flow takes the api_key as input rather than minting one.
 *  - When `awaiting_recovery_key` is set we fold the recovery-key context
 *    into the "not done" line because copying the key is the operator's
 *    remaining task even though the launcher technically did its job.
 */
export function describeSetupAbort(
  snapshot: SetupProgressSnapshot,
): SetupAbortBullets {
  const done: string[] = [];
  const notDone: string[] = [];
  const has = (p: SetupPhase): boolean => snapshot.phases.has(p);

  if (has("chose_role") && snapshot.role) {
    done.push(`Role chosen: ${snapshot.role}.`);
  }

  const profileLabel = snapshot.profileName
    ? `profile "${snapshot.profileName}"`
    : "profile";

  if (has("profile_written")) {
    done.push(`Saved ${profileLabel} config to disk.`);
  } else if (has("chose_role") || snapshot.profileName) {
    // Only mention "config not saved" once we have any anchor (a role choice
    // or a profile name in flight). Without an anchor we have literally no
    // signal to report — the truly empty case must produce empty bullets so
    // the caller can show the generic fallback message instead.
    notDone.push(`${capitalize(profileLabel)} config is not saved yet.`);
  }

  if (snapshot.role === "server") {
    if (has("api_key_minted")) {
      done.push("Minted a CLI API key for this profile.");
    } else if (has("profile_written")) {
      // Only worth mentioning once we are past the prompts that lead up to
      // the mint question; before that, "config not saved yet" already
      // implies nothing was minted either.
      notDone.push(
        "CLI API key not minted (you can mint one later with " +
          "`hirotaskmanager server api-key generate`).",
      );
    }
  }

  if (has("default_pointer_set")) {
    done.push("Updated the default-profile pointer for `hirotm`.");
  } else if (has("profile_written")) {
    notDone.push(
      "Default-profile pointer not updated (use `hirotaskmanager profile use " +
        `${snapshot.profileName ?? "<name>"}` +
        "` later to switch).",
    );
  }

  if (snapshot.role === "server") {
    if (has("awaiting_recovery_key")) {
      done.push(
        snapshot.serverUrl
          ? `Server is running at ${snapshot.serverUrl}.`
          : "Server is running.",
      );
      notDone.push(
        "You have not copied the recovery key yet — copy it from the lines " +
          "above before pressing Ctrl+C again. The server will keep running.",
      );
    } else if (has("server_started")) {
      done.push(
        snapshot.serverUrl
          ? `Server is running at ${snapshot.serverUrl}.`
          : "Server is running.",
      );
    }
  }

  return { done, notDone };
}

function capitalize(text: string): string {
  if (!text) return text;
  return text[0].toUpperCase() + text.slice(1);
}

/**
 * Fallback used when there is genuinely nothing meaningful to report — e.g.
 * Ctrl+C at the very first role-choice prompt before any state exists.
 */
export const SETUP_ABORT_FALLBACK_MESSAGE =
  "Setup is incomplete. Re-run `hirotaskmanager --setup`, " +
  "`--setup-server`, or `--setup-client` to finish.";
