/** Preset keys for board column canvas background (persisted on `Board.boardColor`). */
export const BOARD_COLOR_PRESETS = [
  "stone",
  "cyan",
  "azure",
  "indigo",
  "violet",
  "rose",
  "amber",
  "emerald",
  "coral",
  "sage",
] as const;

export type BoardColorPreset = (typeof BOARD_COLOR_PRESETS)[number];

/** User-facing label for each preset (menu order follows `BOARD_COLOR_PRESETS`). */
export const BOARD_COLOR_LABELS: Record<BoardColorPreset, string> = {
  stone: "Neutral",
  cyan: "Cyan",
  azure: "Azure",
  indigo: "Indigo",
  violet: "Violet",
  rose: "Rose",
  amber: "Amber",
  emerald: "Emerald",
  coral: "Coral",
  sage: "Sage",
};

// New boards and missing `board_color` rows resolve to neutral (stone) instead of a chroma-heavy preset.
export const DEFAULT_BOARD_COLOR: BoardColorPreset = "stone";

export function parseBoardColor(raw: unknown): BoardColorPreset | undefined {
  if (typeof raw !== "string") return undefined;
  return (BOARD_COLOR_PRESETS as readonly string[]).includes(raw)
    ? (raw as BoardColorPreset)
    : undefined;
}

export function resolvedBoardColor(board: {
  boardColor?: BoardColorPreset;
}): BoardColorPreset {
  return board.boardColor ?? DEFAULT_BOARD_COLOR;
}

/**
 * Layered radial + linear gradients for the board column canvas.
 * Top layer: soft highlight; bottom: multi-stop diagonal wash (cards stay on `card`).
 */
export const BOARD_CANVAS_BACKGROUND: Record<BoardColorPreset, string> = {
  cyan:
    "radial-gradient(ellipse 90% 70% at 12% -5%, hsl(188 58% 52% / 0.45) 0%, transparent 55%), linear-gradient(155deg, hsl(192 50% 44%) 0%, hsl(196 48% 34%) 42%, hsl(204 46% 22%) 100%)",
  azure:
    "radial-gradient(ellipse 90% 70% at 12% -5%, hsl(210 60% 55% / 0.42) 0%, transparent 55%), linear-gradient(155deg, hsl(211 52% 46%) 0%, hsl(216 48% 36%) 42%, hsl(222 44% 24%) 100%)",
  indigo:
    "radial-gradient(ellipse 90% 70% at 12% -5%, hsl(250 55% 58% / 0.4) 0%, transparent 55%), linear-gradient(155deg, hsl(239 46% 48%) 0%, hsl(242 44% 36%) 42%, hsl(248 42% 24%) 100%)",
  violet:
    "radial-gradient(ellipse 90% 70% at 12% -5%, hsl(285 52% 58% / 0.4) 0%, transparent 55%), linear-gradient(155deg, hsl(271 44% 48%) 0%, hsl(278 42% 34%) 42%, hsl(285 40% 22%) 100%)",
  rose:
    "radial-gradient(ellipse 90% 70% at 12% -5%, hsl(350 58% 58% / 0.42) 0%, transparent 55%), linear-gradient(155deg, hsl(343 46% 48%) 0%, hsl(348 44% 34%) 42%, hsl(355 42% 24%) 100%)",
  amber:
    "radial-gradient(ellipse 90% 70% at 12% -5%, hsl(45 95% 55% / 0.38) 0%, transparent 55%), linear-gradient(155deg, hsl(38 88% 46%) 0%, hsl(34 85% 36%) 42%, hsl(28 80% 26%) 100%)",
  emerald:
    "radial-gradient(ellipse 90% 70% at 12% -5%, hsl(155 50% 48% / 0.4) 0%, transparent 55%), linear-gradient(155deg, hsl(158 46% 40%) 0%, hsl(160 44% 30%) 42%, hsl(165 42% 20%) 100%)",
  stone:
    "radial-gradient(ellipse 90% 70% at 12% -5%, hsl(35 22% 52% / 0.35) 0%, transparent 55%), linear-gradient(155deg, hsl(30 16% 40%) 0%, hsl(26 14% 30%) 42%, hsl(22 12% 18%) 100%)",
  coral:
    "radial-gradient(ellipse 90% 70% at 12% -5%, hsl(18 85% 62% / 0.4) 0%, transparent 55%), linear-gradient(155deg, hsl(16 70% 50%) 0%, hsl(14 68% 38%) 42%, hsl(12 62% 26%) 100%)",
  sage:
    "radial-gradient(ellipse 90% 70% at 12% -5%, hsl(145 40% 50% / 0.38) 0%, transparent 55%), linear-gradient(155deg, hsl(142 30% 40%) 0%, hsl(145 28% 30%) 42%, hsl(150 26% 20%) 100%)",
};

export function boardCanvasBackground(preset: BoardColorPreset): string {
  return BOARD_CANVAS_BACKGROUND[preset];
}
