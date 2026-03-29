import type { Board } from "../../../shared/models";

/** Stable light tint per status string — rail + matching list band (no borders needed). */
export function statusBandSurfaceClass(status: string): string {
  const palette = [
    "bg-sky-500/[0.08] dark:bg-sky-400/[0.12]",
    "bg-emerald-500/[0.08] dark:bg-emerald-400/[0.12]",
    "bg-amber-500/[0.08] dark:bg-amber-400/[0.12]",
    "bg-violet-500/[0.08] dark:bg-violet-400/[0.12]",
    "bg-rose-500/[0.08] dark:bg-rose-400/[0.12]",
    "bg-cyan-500/[0.08] dark:bg-cyan-400/[0.12]",
  ];
  let h = 0;
  for (let i = 0; i < status.length; i++) {
    h = (h + status.charCodeAt(i) * (i + 1)) % palette.length;
  }
  return palette[h] ?? palette[0]!;
}

/** Statuses shown on the board, in definition order. */
export function visibleStatusesForBoard(board: Board): string[] {
  const vis = board.visibleStatuses.filter((s) =>
    board.statusDefinitions.includes(s),
  );
  if (vis.length > 0) {
    return board.statusDefinitions.filter((s) => vis.includes(s));
  }
  return [...board.statusDefinitions];
}

export function bandWeightsForBoard(board: Board): number[] {
  const vis = visibleStatusesForBoard(board);
  const stored = board.statusBandWeights;
  if (
    stored &&
    stored.length === vis.length &&
    stored.every((n) => Number.isFinite(n) && n > 0)
  ) {
    return [...stored];
  }
  return vis.map(() => 1);
}

/** When visibility changes, carry over weights for kept statuses; new ones get 1; then normalize. */
export function weightsAfterVisibilityChange(
  prevStatuses: string[],
  prevWeights: number[],
  nextStatuses: string[],
): number[] {
  const map = new Map(
    prevStatuses.map((s, i) => [s, prevWeights[i] ?? 1] as const),
  );
  const raw = nextStatuses.map((s) => map.get(s) ?? 1);
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const target = nextStatuses.length;
  return raw.map((w) => (w / sum) * target);
}
