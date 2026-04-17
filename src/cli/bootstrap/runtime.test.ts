import { describe, expect, test } from "bun:test";
import { readClientNameArg, readProfileArg } from "./runtime";

describe("readClientNameArg", () => {
  test("parses --client-name value form", () => {
    expect(
      readClientNameArg(["hirotm", "--client-name", "Agent", "boards"]),
    ).toBe("Agent");
  });

  test("parses --client-name=value form", () => {
    expect(readClientNameArg(["x", "--client-name=Foo"])).toBe("Foo");
  });

  test("returns undefined when absent", () => {
    expect(readClientNameArg(["boards", "list"])).toBeUndefined();
  });
});

describe("readProfileArg", () => {
  test("parses --profile value form", () => {
    expect(readProfileArg(["hirotm", "--profile", "dev", "x"])).toBe("dev");
  });

  test("parses --profile=value form", () => {
    expect(readProfileArg(["--profile=ci"])).toBe("ci");
  });

  test("returns undefined when absent", () => {
    expect(readProfileArg([])).toBeUndefined();
  });
});

