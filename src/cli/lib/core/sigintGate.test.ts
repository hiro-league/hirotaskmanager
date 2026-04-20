import { afterEach, describe, expect, test } from "bun:test";
import process from "node:process";
import { installSigintGate } from "./sigintGate";

// Pin the two-stage SIGINT contract: 1st press fires onFirstPress and arms
// the gate, 2nd press inside the window fires onSecondPress and exits via
// the injected exitFn. After resetAfterMs the armed flag clears so a stray
// press an hour later does not silently abort the session.

interface InstalledGate {
  dispose(): void;
}

describe("installSigintGate", () => {
  const installed: InstalledGate[] = [];

  afterEach(() => {
    while (installed.length > 0) {
      const g = installed.pop();
      try {
        g?.dispose();
      } catch {
        /* best effort */
      }
    }
  });

  test("first SIGINT fires onFirstPress, arms the gate, and does NOT exit", () => {
    let firstCount = 0;
    let secondCount = 0;
    let exitedWith: number | null = null;
    const gate = installSigintGate({
      onFirstPress: () => {
        firstCount += 1;
      },
      onSecondPress: () => {
        secondCount += 1;
      },
      exitFn: (code) => {
        exitedWith = code;
      },
    });
    installed.push(gate);

    process.emit("SIGINT");

    expect(firstCount).toBe(1);
    expect(secondCount).toBe(0);
    expect(exitedWith).toBeNull();
    expect(gate.isArmed()).toBe(true);
  });

  test("second SIGINT inside the window fires onSecondPress and calls exitFn(130)", () => {
    let firstCount = 0;
    let secondCount = 0;
    let exitedWith: number | null = null;
    const gate = installSigintGate({
      onFirstPress: () => {
        firstCount += 1;
      },
      onSecondPress: () => {
        secondCount += 1;
      },
      exitFn: (code) => {
        exitedWith = code;
      },
    });
    installed.push(gate);

    process.emit("SIGINT");
    process.emit("SIGINT");

    expect(firstCount).toBe(1);
    expect(secondCount).toBe(1);
    // Cast back to the declared union: TS's control-flow analysis narrows
    // `exitedWith` to `null` after the earlier `toBeNull()` assertion in the
    // sibling test pattern and does not re-widen across the closure assignment
    // performed by `exitFn`. The runtime value is a number set inside `exitFn`.
    expect(exitedWith as number | null).toBe(130);
    // After the second press the gate disarms so a stray third press would
    // be treated as a fresh first press (this matches the intent: do not
    // double-exit if the test exitFn is a no-op in production exit() never
    // returns anyway).
    expect(gate.isArmed()).toBe(false);
  });

  test("a custom exitCode is forwarded to exitFn", () => {
    let exitedWith: number | null = null;
    const gate = installSigintGate({
      onFirstPress: () => {},
      onSecondPress: () => {},
      exitCode: 42,
      exitFn: (code) => {
        exitedWith = code;
      },
    });
    installed.push(gate);

    process.emit("SIGINT");
    process.emit("SIGINT");
    // Same CFA-narrowing reason as in the prior test: `exitedWith` is declared
    // as `number | null` but TS narrows it to `null` from the initialiser.
    expect(exitedWith as number | null).toBe(42);
  });

  test("after resetAfterMs the gate disarms and a third press is treated as a new first press", async () => {
    let firstCount = 0;
    let secondCount = 0;
    let exitedWith: number | null = null;
    const gate = installSigintGate({
      onFirstPress: () => {
        firstCount += 1;
      },
      onSecondPress: () => {
        secondCount += 1;
      },
      resetAfterMs: 25,
      exitFn: (code) => {
        exitedWith = code;
      },
    });
    installed.push(gate);

    process.emit("SIGINT");
    expect(gate.isArmed()).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(gate.isArmed()).toBe(false);

    process.emit("SIGINT");
    expect(firstCount).toBe(2);
    expect(secondCount).toBe(0);
    expect(exitedWith).toBeNull();
    expect(gate.isArmed()).toBe(true);
  });

  test("dispose removes the listener and clears armed state", () => {
    let firstCount = 0;
    const gate = installSigintGate({
      onFirstPress: () => {
        firstCount += 1;
      },
      onSecondPress: () => {},
      exitFn: () => {},
    });

    process.emit("SIGINT");
    expect(firstCount).toBe(1);
    expect(gate.isArmed()).toBe(true);

    gate.dispose();
    expect(gate.isArmed()).toBe(false);

    // After dispose the listener must be gone — emitting SIGINT now must
    // NOT invoke onFirstPress again. (No installed.push here because we
    // already disposed.)
    process.emit("SIGINT");
    expect(firstCount).toBe(1);
  });

  test("a thrown error from onFirstPress is swallowed (printer failure must not block the gate)", () => {
    const gate = installSigintGate({
      onFirstPress: () => {
        throw new Error("boom");
      },
      onSecondPress: () => {},
      exitFn: () => {},
    });
    installed.push(gate);

    expect(() => process.emit("SIGINT")).not.toThrow();
    expect(gate.isArmed()).toBe(true);
  });
});
