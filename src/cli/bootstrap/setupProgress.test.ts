import { describe, expect, test } from "bun:test";
import {
  createSetupProgress,
  describeSetupAbort,
  SETUP_ABORT_FALLBACK_MESSAGE,
} from "./setupProgress";

// These tests pin the contract of the abort report consumed by the two-stage
// Ctrl+C flow (sigintGate.ts + setupAbortMessages.ts). The wording is part
// of the operator-visible UX so we assert on substrings rather than exact
// strings to keep the tests resilient to small phrasing tweaks while still
// catching regressions in *what* gets reported.

describe("SetupProgress + describeSetupAbort", () => {
  test("empty progress reports nothing and the fallback message kicks in", () => {
    const progress = createSetupProgress();
    const { done, notDone } = describeSetupAbort(progress.snapshot());
    expect(done).toEqual([]);
    expect(notDone).toEqual([]);
    // Caller (setupAbortMessages) is responsible for printing the fallback
    // when both lists are empty; the constant must remain exported so the
    // launcher can reference the same string.
    expect(SETUP_ABORT_FALLBACK_MESSAGE).toMatch(/re-run/i);
  });

  test("role + profile name only: reports role chosen and profile-not-saved", () => {
    const progress = createSetupProgress();
    progress.setRole("server");
    progress.setProfileName("server");
    const { done, notDone } = describeSetupAbort(progress.snapshot());
    expect(done.some((l) => l.includes("Role chosen: server"))).toBe(true);
    expect(notDone.some((l) => /not saved yet/i.test(l))).toBe(true);
    expect(notDone.some((l) => l.includes('"server"'))).toBe(true);
  });

  test("server flow: profile_written without api_key_minted reports the missing key", () => {
    const progress = createSetupProgress();
    progress.setRole("server");
    progress.setProfileName("dev");
    progress.mark("profile_written");
    const { done, notDone } = describeSetupAbort(progress.snapshot());
    expect(done.some((l) => l.includes("Saved") && l.includes("dev"))).toBe(true);
    expect(notDone.some((l) => /CLI API key not minted/i.test(l))).toBe(true);
    expect(
      notDone.some((l) => /Default-profile pointer not updated/i.test(l)),
    ).toBe(true);
  });

  test("client flow does NOT mention CLI API key minting (key is pasted, not minted)", () => {
    const progress = createSetupProgress();
    progress.setRole("client");
    progress.setProfileName("remote");
    progress.mark("profile_written");
    const { done, notDone } = describeSetupAbort(progress.snapshot());
    expect(done.some((l) => l.includes("Saved"))).toBe(true);
    expect(
      [...done, ...notDone].some((l) => /CLI API key/i.test(l)),
    ).toBe(false);
  });

  test("server flow with all milestones reports each as done", () => {
    const progress = createSetupProgress();
    progress.setRole("server");
    progress.setProfileName("dev");
    progress.setServerUrl("http://127.0.0.1:3001");
    progress.mark("profile_written");
    progress.mark("api_key_minted");
    progress.mark("default_pointer_set");
    progress.mark("server_started");
    const { done, notDone } = describeSetupAbort(progress.snapshot());
    expect(done.some((l) => l.includes("Saved"))).toBe(true);
    expect(done.some((l) => /Minted a CLI API key/i.test(l))).toBe(true);
    expect(done.some((l) => /default-profile pointer/i.test(l))).toBe(true);
    expect(
      done.some((l) => l.includes("http://127.0.0.1:3001")),
    ).toBe(true);
    expect(notDone).toEqual([]);
  });

  test("awaiting_recovery_key folds in the 'copy your key' caveat in notDone", () => {
    const progress = createSetupProgress();
    progress.setRole("server");
    progress.setProfileName("dev");
    progress.setServerUrl("http://127.0.0.1:3001");
    progress.mark("profile_written");
    progress.mark("server_started");
    progress.mark("awaiting_recovery_key");
    const { done, notDone } = describeSetupAbort(progress.snapshot());
    expect(
      done.some((l) => l.includes("http://127.0.0.1:3001")),
    ).toBe(true);
    expect(
      notDone.some(
        (l) => /recovery key/i.test(l) && /copy/i.test(l),
      ),
    ).toBe(true);
    expect(
      notDone.some((l) => /server will keep running/i.test(l)),
    ).toBe(true);
  });

  test("currentPromptLabel round-trips and clears", () => {
    const progress = createSetupProgress();
    progress.setCurrentPromptLabel("Port for web/api");
    expect(progress.snapshot().currentPromptLabel).toBe("Port for web/api");
    progress.setCurrentPromptLabel(null);
    expect(progress.snapshot().currentPromptLabel).toBeNull();
  });

  test("snapshot returns an immutable view (mutating the original after snapshot does not change it)", () => {
    const progress = createSetupProgress();
    progress.mark("profile_written");
    const snap = progress.snapshot();
    progress.mark("server_started");
    expect(snap.phases.has("server_started")).toBe(false);
    expect(snap.phases.has("profile_written")).toBe(true);
  });
});
