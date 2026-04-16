/** @vitest-environment jsdom */
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useBoardKeyboardNav } from "./BoardKeyboardNavContext";

function Consumer() {
  useBoardKeyboardNav();
  return null;
}

describe("BoardKeyboardNavContext", () => {
  test("useBoardKeyboardNav throws outside BoardKeyboardNavProvider", () => {
    expect(() => render(<Consumer />)).toThrow(
      /useBoardKeyboardNav must be used within BoardKeyboardNavProvider/,
    );
  });
});
