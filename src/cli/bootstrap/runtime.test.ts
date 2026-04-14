import { describe, expect, test } from "bun:test";
import {
  readClientNameArg,
  readPortArg,
  readProfileArg,
} from "./runtime";

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

describe("readPortArg", () => {
  test("parses --port value form", () => {
    expect(readPortArg(["hirotm", "--port", "3002", "boards"])).toBe(3002);
  });

  test("parses --port=value form", () => {
    expect(readPortArg(["--port=4000"])).toBe(4000);
  });

  test("returns undefined when absent", () => {
    expect(readPortArg(["boards", "list"])).toBeUndefined();
  });
});
