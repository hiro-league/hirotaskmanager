import { describe, expect, test } from "bun:test";
import { createSetupProgress } from "../../bootstrap/setupProgress";
import {
  printSetupAbortFinal,
  printSetupAbortPreview,
  type AbortPrintTarget,
} from "./setupAbortMessages";

// AbortPrintTarget lets us capture output without colour-stripping headaches.
// All assertions below ignore ANSI codes by setting isTTY=false.

function makeBuf(): { buf: string; target: AbortPrintTarget } {
  let buf = "";
  return {
    get buf() {
      return buf;
    },
    target: {
      isTTY: false,
      write(chunk: string): boolean {
        buf += chunk;
        return true;
      },
    } as AbortPrintTarget & { isTTY: false },
  } as unknown as { buf: string; target: AbortPrintTarget };
}

describe("printSetupAbortPreview", () => {
  test("empty progress prints the header + fallback message", () => {
    const out = makeBuf();
    printSetupAbortPreview(createSetupProgress().snapshot(), out.target);
    expect(out.buf).toMatch(/Press Ctrl\+C again within 5 seconds/);
    expect(out.buf).toMatch(/Setup is incomplete/);
    // No "Already done" / "Not done yet" headings when both lists are empty.
    expect(out.buf).not.toMatch(/Already done:/);
    expect(out.buf).not.toMatch(/Not done yet:/);
  });

  test("partial progress prints both 'Already done' and 'Not done yet' sections", () => {
    const progress = createSetupProgress();
    progress.setRole("server");
    progress.setProfileName("dev");
    progress.mark("profile_written");
    const out = makeBuf();
    printSetupAbortPreview(progress.snapshot(), out.target);
    expect(out.buf).toMatch(/Already done:/);
    expect(out.buf).toMatch(/Saved profile "dev"/);
    expect(out.buf).toMatch(/Not done yet:/);
    expect(out.buf).toMatch(/CLI API key not minted/);
  });

  test("currentPromptLabel surfaces in the resume hint", () => {
    const progress = createSetupProgress();
    progress.setCurrentPromptLabel("Port for web/api");
    const out = makeBuf();
    printSetupAbortPreview(progress.snapshot(), out.target);
    expect(out.buf).toMatch(/Waiting on: Port for web\/api/);
  });

  test("no currentPromptLabel falls back to the generic resume hint", () => {
    const out = makeBuf();
    printSetupAbortPreview(createSetupProgress().snapshot(), out.target);
    expect(out.buf).toMatch(/Press Enter to resume/);
  });
});

describe("printSetupAbortFinal", () => {
  test("default phase prints 'Setup aborted.'", () => {
    const out = makeBuf();
    printSetupAbortFinal(createSetupProgress().snapshot(), out.target);
    expect(out.buf).toMatch(/Setup aborted\./);
  });

  test("awaiting_recovery_key phase prints the launcher-only-closes message with the URL", () => {
    const progress = createSetupProgress();
    progress.setRole("server");
    progress.setServerUrl("http://127.0.0.1:3001");
    progress.mark("awaiting_recovery_key");
    const out = makeBuf();
    printSetupAbortFinal(progress.snapshot(), out.target);
    expect(out.buf).toMatch(/Launcher closed/);
    expect(out.buf).toMatch(/Server keeps running at http:\/\/127\.0\.0\.1:3001/);
    expect(out.buf).not.toMatch(/Setup aborted/);
  });
});
