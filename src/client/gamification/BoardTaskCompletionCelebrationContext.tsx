import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { emojiPresets, optimizeConfigForMobile, useReward } from "partycles";
import {
  pickWeightedCompletionAnimationIndex,
  playCompletionSound,
  prefersReducedMotion,
} from "./completionRewards";

export type CelebrateTaskCompletionOptions = {
  /** Prefer the “Mark complete” button (`data-task-complete-button`) for this task. */
  taskId?: number;
  /** Emit from this element (e.g. click target or task editor dialog). Overrides `taskId` when set. */
  anchorEl?: HTMLElement | null;
};

export type BoardTaskCompletionCelebrationContextValue = {
  /** Random sound + weighted Partycles burst from the resolved anchor (see Partycles `useReward` + [demo](https://jonathanleane.github.io/partycles/)). */
  celebrateTaskCompletion: (opts?: CelebrateTaskCompletionOptions) => void;
};

const BoardTaskCompletionCelebrationContext =
  createContext<BoardTaskCompletionCelebrationContextValue | null>(null);

/** Move the shared anchor to the center of `target` so particles originate like the library’s button examples. */
function positionAnchorFromTarget(
  anchorMount: HTMLDivElement,
  target: HTMLElement,
): void {
  const r = target.getBoundingClientRect();
  anchorMount.style.position = "fixed";
  anchorMount.style.left = `${r.left + r.width / 2}px`;
  anchorMount.style.top = `${r.top + r.height / 2}px`;
  anchorMount.style.width = "1px";
  anchorMount.style.height = "1px";
  anchorMount.style.transform = "translate(-50%, -50%)";
  anchorMount.style.zIndex = "100";
  anchorMount.style.pointerEvents = "none";
}

function fallbackAnchorViewport(anchorMount: HTMLDivElement): void {
  anchorMount.style.position = "fixed";
  anchorMount.style.left = "50vw";
  anchorMount.style.top = "35vh";
  anchorMount.style.width = "1px";
  anchorMount.style.height = "1px";
  anchorMount.style.transform = "translate(-50%, -50%)";
  anchorMount.style.zIndex = "100";
  anchorMount.style.pointerEvents = "none";
}

function resolveCompletionAnchor(
  opts?: CelebrateTaskCompletionOptions,
): HTMLElement | null {
  if (opts?.anchorEl) return opts.anchorEl;
  if (opts?.taskId != null && typeof document !== "undefined") {
    const sid = String(opts.taskId);
    const btn = document.querySelector(
      `[data-task-card-root][data-task-id="${sid}"] [data-task-complete-button]`,
    );
    if (btn instanceof HTMLElement) return btn;
    const card = document.querySelector(
      `[data-task-card-root][data-task-id="${sid}"]`,
    );
    if (card instanceof HTMLElement) return card;
  }
  return null;
}

/**
 * Mount once per board view: invisible anchor for Particles + `celebrateTaskCompletion`.
 */
export function BoardTaskCompletionCelebrationProvider({
  children,
  celebrationSoundsMuted,
}: {
  children: ReactNode;
  /** Per-board: when true, skip completion audio (particles still run unless reduced motion). */
  celebrationSoundsMuted: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const anchor = anchorRef as RefObject<HTMLElement>;

  // Order must match `pickWeightedCompletionAnimationIndex()` mapping in completionRewards.ts
  const confetti = useReward(
    anchor,
    "confetti",
    optimizeConfigForMobile({
      particleCount: 42,
      spread: 56,
      effects: { flutter: true },
    }),
  );
  const magicdust = useReward(
    anchor,
    "magicdust",
    optimizeConfigForMobile({
      particleCount: 32,
      colors: ["#a855f7", "#6366f1", "#38bdf8"],
    }),
  );
  const stars = useReward(
    anchor,
    "stars",
    optimizeConfigForMobile({
      particleCount: 28,
      physics: { gravity: 0.35 },
      effects: { twinkle: true },
    }),
  );
  const crystals = useReward(
    anchor,
    "crystals",
    optimizeConfigForMobile({ particleCount: 22, elementSize: 24 }),
  );
  const coins = useReward(
    anchor,
    "coins",
    optimizeConfigForMobile({
      particleCount: 24,
      physics: { gravity: 0.45 },
      effects: { spin3D: true },
    }),
  );
  const paint = useReward(
    anchor,
    "paint",
    optimizeConfigForMobile({ particleCount: 26, startVelocity: 32 }),
  );
  const galaxy = useReward(
    anchor,
    "galaxy",
    optimizeConfigForMobile({ particleCount: 48, spread: 180 }),
  );
  const fireworks = useReward(
    anchor,
    "fireworks",
    optimizeConfigForMobile({ particleCount: 36, spread: 130 }),
  );
  const hearts = useReward(
    anchor,
    "hearts",
    optimizeConfigForMobile({
      particleCount: 18,
      colors: ["#f43f5e", "#ec4899", "#fb7185"],
      effects: { pulse: true },
    }),
  );
  const emoji = useReward(
    anchor,
    "emoji",
    optimizeConfigForMobile({
      particleCount: 22,
      colors: emojiPresets.celebration,
    }),
  );
  const mortar = useReward(
    anchor,
    "mortar",
    optimizeConfigForMobile({
      particleCount: 3,
      spread: 50,
      physics: { gravity: 0.35 },
    }),
  );

  const rewardControllers = useMemo(
    () => [
      confetti,
      magicdust,
      stars,
      crystals,
      coins,
      paint,
      galaxy,
      fireworks,
      hearts,
      emoji,
      mortar,
    ],
    [
      confetti,
      magicdust,
      stars,
      crystals,
      coins,
      paint,
      galaxy,
      fireworks,
      hearts,
      emoji,
      mortar,
    ],
  );

  const celebrateTaskCompletion = useCallback(
    (opts?: CelebrateTaskCompletionOptions) => {
      playCompletionSound(celebrationSoundsMuted);
      if (prefersReducedMotion()) return;
      const el = anchorRef.current;
      if (!el) return;
      const target = resolveCompletionAnchor(opts);
      if (target) {
        positionAnchorFromTarget(el, target);
      } else {
        fallbackAnchorViewport(el);
      }
      const idx = pickWeightedCompletionAnimationIndex();
      const ctrl = rewardControllers[idx];
      if (ctrl) void ctrl.reward();
    },
    [celebrationSoundsMuted, rewardControllers],
  );

  const value = useMemo(
    (): BoardTaskCompletionCelebrationContextValue => ({
      celebrateTaskCompletion,
    }),
    [celebrateTaskCompletion],
  );

  return (
    <BoardTaskCompletionCelebrationContext.Provider value={value}>
      {/* Particles anchor — positioned in JS to match button/dialog like Partycles examples. */}
      <div
        ref={anchorRef}
        aria-hidden
        className="pointer-events-none overflow-visible"
      />
      {children}
    </BoardTaskCompletionCelebrationContext.Provider>
  );
}

export function useBoardTaskCompletionCelebration(): BoardTaskCompletionCelebrationContextValue {
  const ctx = useContext(BoardTaskCompletionCelebrationContext);
  if (!ctx) {
    throw new Error(
      "useBoardTaskCompletionCelebration must be used within BoardTaskCompletionCelebrationProvider",
    );
  }
  return ctx;
}

export function useBoardTaskCompletionCelebrationOptional(): BoardTaskCompletionCelebrationContextValue | null {
  return useContext(BoardTaskCompletionCelebrationContext);
}
