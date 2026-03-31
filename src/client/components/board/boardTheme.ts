import type { CSSProperties } from "react";
import type { BoardColorPreset } from "../../../shared/boardColor";

type BoardThemeStyle = CSSProperties & Record<`--${string}`, string>;

interface BoardThemeSeed {
  hue: number;
  surfaceChroma: number;
}

interface BoardThemeModeProfile {
  startL: number;
  endL: number;
  chroma: number;
}

const BOARD_THEME_SEEDS: Record<BoardColorPreset, BoardThemeSeed> = {
  cyan: { hue: 205, surfaceChroma: 0.05 },
  azure: { hue: 235, surfaceChroma: 0.045 },
  indigo: { hue: 275, surfaceChroma: 0.04 },
  violet: { hue: 315, surfaceChroma: 0.045 },
  rose: { hue: 20, surfaceChroma: 0.05 },
  amber: { hue: 75, surfaceChroma: 0.05 },
  emerald: { hue: 155, surfaceChroma: 0.045 },
  // Keep the persisted key for backwards compatibility, but treat it as the
  // neutral board option in the UI/theme layer.
  stone: { hue: 65, surfaceChroma: 0.02 },
  coral: { hue: 35, surfaceChroma: 0.055 },
  sage: { hue: 145, surfaceChroma: 0.03 },
};

// Only 3 knobs per mode:
// - startL: top-left lightness
// - endL: bottom-right lightness
// - chroma: overall saturation strength
const LIGHT_THEME_PROFILE: BoardThemeModeProfile = {
  startL: 0.8,
  endL: 0.9,
  chroma: 0.175,
};

const DARK_THEME_PROFILE: BoardThemeModeProfile = {
  startL: 0.6,
  endL: 0.7,
  chroma: 0.135,
};

function oklch(
  lightness: number,
  chroma: number,
  hue: number,
  alpha?: number,
): string {
  const l = lightness.toFixed(3);
  const c = chroma.toFixed(3);
  const h = hue.toFixed(3);
  if (alpha === undefined) return `oklch(${l} ${c} ${h})`;
  return `oklch(${l} ${c} ${h} / ${alpha})`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function chromaScale(seed: BoardThemeSeed): number {
  return clamp(seed.surfaceChroma / 0.05, 0.6, 1.12);
}

function modeProfile(dark: boolean): BoardThemeModeProfile {
  return dark ? DARK_THEME_PROFILE : LIGHT_THEME_PROFILE;
}

function isNeutralPreset(preset: BoardColorPreset): boolean {
  return preset === "stone";
}

function boardCanvasGradient(seed: BoardThemeSeed, dark: boolean): string {
  const profile = modeProfile(dark);
  const scale = chromaScale(seed);
  const hue = seed.hue + (dark ? 0 : 5);
  return `linear-gradient(135deg, ${oklch(profile.startL, profile.chroma * scale, hue)} 0%, ${oklch(profile.endL, profile.chroma * scale, hue)} 100%)`;
}

function boardHeaderBackground(seed: BoardThemeSeed, dark: boolean): string {
  const profile = modeProfile(dark);
  const scale = chromaScale(seed);
  const hue = seed.hue + (dark ? 0 : 5);
  const headerL = dark ? profile.startL - 0.1 : profile.startL - 0.1;
  return `linear-gradient(180deg, ${oklch(headerL, profile.chroma * scale * 1.15, hue, 1)} 0%, ${oklch(headerL, profile.chroma * scale * 0.7, hue, 1)} 100%)`;
}

function boardHeaderBorder(seed: BoardThemeSeed, dark: boolean): string {
  const profile = modeProfile(dark);
  const scale = chromaScale(seed);
  const hue = seed.hue + (dark ? 2 : 1);
  const borderL = dark ? profile.startL - 0.02 : profile.endL - 0.15;
  const borderAlpha = dark ? 0.56 : 0.72;
  return oklch(borderL, profile.chroma * scale * 0.52, hue, borderAlpha);
}

export function getBoardThemeStyle(
  preset: BoardColorPreset,
  dark: boolean,
): BoardThemeStyle {
  if (isNeutralPreset(preset)) {
    return dark
      ? {
          "--board-canvas-image":
            "linear-gradient(135deg, oklch(0.24 0.008 260) 0%, oklch(0.16 0.010 260) 100%)",
          "--board-header-bg":
            "linear-gradient(180deg, oklch(0.32 0.010 260 / 1) 0%, oklch(0.25 0.008 260 / 1) 100%)",
          "--board-header-border": oklch(0.38, 0.012, 260, 0.62),
        }
      : {
          "--board-canvas-image":
            "linear-gradient(135deg, oklch(0.92 0.006 260) 0%, oklch(0.84 0.008 260) 100%)",
          "--board-header-bg":
            "linear-gradient(180deg, oklch(0.86 0.010 260 / 1) 0%, oklch(0.79 0.012 260 / 1) 100%)",
          "--board-header-border": oklch(0.72, 0.012, 260, 0.72),
        };
  }

  const seed = BOARD_THEME_SEEDS[preset];

  // Keep board theming intentionally narrow: only the canvas and top header
  // should carry the board identity so the rest of the UI stays familiar.
  return {
    "--board-canvas-image": boardCanvasGradient(seed, dark),
    "--board-header-bg": boardHeaderBackground(seed, dark),
    "--board-header-border": boardHeaderBorder(seed, dark),
  };
}

export function getBoardThemePreviewBackground(
  preset: BoardColorPreset,
): string {
  // Match `getBoardThemeStyle` neutral branch (light canvas) so swatches match the board.
  if (isNeutralPreset(preset)) {
    return "linear-gradient(135deg, oklch(0.92 0.006 260) 0%, oklch(0.84 0.008 260) 100%)";
  }
  return boardCanvasGradient(BOARD_THEME_SEEDS[preset], false);
}
