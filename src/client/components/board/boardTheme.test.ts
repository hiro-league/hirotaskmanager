import { describe, expect, test } from "vitest";
import type { BoardColorPreset } from "../../../shared/boardColor";
import { getBoardThemePreviewBackground, getBoardThemeStyle } from "./boardTheme";

describe("boardTheme", () => {
  test("getBoardThemeStyle returns CSS variables for chroma presets", () => {
    const style = getBoardThemeStyle("cyan" as BoardColorPreset, false);
    expect(style["--board-canvas-image"]).toMatch(/linear-gradient/);
    expect(style["--board-header-bg"]).toMatch(/linear-gradient/);
    expect(style["--board-header-border"]).toMatch(/oklch/);
    expect(style["--board-selection-ring"]).toMatch(/oklch/);
  });

  test("getBoardThemeStyle neutral stone uses fixed oklch surfaces", () => {
    const light = getBoardThemeStyle("stone" as BoardColorPreset, false);
    expect(light["--board-canvas-image"]).toMatch(/oklch/);
    const dark = getBoardThemeStyle("stone" as BoardColorPreset, true);
    expect(dark["--board-canvas-image"]).toMatch(/oklch/);
  });

  test("getBoardThemePreviewBackground matches light neutral for stone", () => {
    const bg = getBoardThemePreviewBackground("stone" as BoardColorPreset);
    expect(bg).toMatch(/linear-gradient/);
  });

  test("getBoardThemePreviewBackground uses gradient for chroma presets", () => {
    const bg = getBoardThemePreviewBackground("emerald" as BoardColorPreset);
    expect(bg).toMatch(/linear-gradient/);
  });
});
