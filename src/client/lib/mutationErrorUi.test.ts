import { describe, expect, test } from "vitest";
import {
  parseApiErrorMessage,
  parseReleaseApiErrorMessage,
} from "./mutationErrorUi";

describe("mutationErrorUi", () => {
  test("parseApiErrorMessage unwraps JSON error string", () => {
    expect(parseApiErrorMessage(new Error('{"error":"bad"}'))).toBe("bad");
  });

  test("parseApiErrorMessage returns short plain text", () => {
    expect(parseApiErrorMessage(new Error("oops"))).toBe("oops");
  });

  test("parseApiErrorMessage falls back for long or empty messages", () => {
    expect(parseApiErrorMessage(new Error(""))).toBe("Something went wrong.");
    const long = "x".repeat(300);
    expect(parseApiErrorMessage(new Error(long))).toBe("Something went wrong.");
  });

  test("parseReleaseApiErrorMessage maps duplicate patterns", () => {
    expect(parseReleaseApiErrorMessage("duplicate name")).toBe(
      "A release with this name already exists on this board.",
    );
    expect(parseReleaseApiErrorMessage("already exists on this board")).toBe(
      "A release with this name already exists on this board.",
    );
  });

  test("parseReleaseApiErrorMessage returns short unique messages", () => {
    expect(parseReleaseApiErrorMessage("not found")).toBe("not found");
  });
});
