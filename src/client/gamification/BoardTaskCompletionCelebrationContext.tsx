import {
  createContext,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  playCompletionSound,
  prefersReducedMotion,
} from "./completionRewards";
import type { CelebrateTaskCompletionOptions } from "./celebrateTaskCompletionTypes";
import type { BoardTaskCompletionCelebrationRewardsProps } from "./BoardTaskCompletionCelebrationRewards";

export type { CelebrateTaskCompletionOptions };

export type BoardTaskCompletionCelebrationContextValue = {
  /** Random sound + weighted Partycles burst from the resolved anchor (see Partycles `useReward` + [demo](https://jonathanleane.github.io/partycles/)). */
  celebrateTaskCompletion: (opts?: CelebrateTaskCompletionOptions) => void;
};

const BoardTaskCompletionCelebrationContext =
  createContext<BoardTaskCompletionCelebrationContextValue | null>(null);

/**
 * Mount once per board view: invisible anchor for Particles + `celebrateTaskCompletion`.
 * `partycles` loads on first completion via dynamic import of `BoardTaskCompletionCelebrationRewards`.
 */
export function BoardTaskCompletionCelebrationProvider({
  children,
  celebrationSoundsMuted,
}: {
  children: ReactNode;
  /** Per-board: when true, skip completion audio (particles still run unless reduced motion). */
  celebrationSoundsMuted: boolean;
}) {
  const [RewardsComponent, setRewardsComponent] = useState<ComponentType<
    BoardTaskCompletionCelebrationRewardsProps
  > | null>(null);
  const particleRunnerRef = useRef<
    ((opts?: CelebrateTaskCompletionOptions) => void) | null
  >(null);
  const pendingRef = useRef<CelebrateTaskCompletionOptions[]>([]);
  const rewardsLoadStartedRef = useRef(false);

  const onRewardsReady = useCallback(
    (runParticles: (opts?: CelebrateTaskCompletionOptions) => void) => {
      particleRunnerRef.current = runParticles;
      for (const o of pendingRef.current) {
        runParticles(o);
      }
      pendingRef.current = [];
    },
    [],
  );

  const celebrateTaskCompletion = useCallback(
    (opts?: CelebrateTaskCompletionOptions) => {
      playCompletionSound(celebrationSoundsMuted);
      if (prefersReducedMotion()) return;
      if (particleRunnerRef.current) {
        particleRunnerRef.current(opts);
        return;
      }
      pendingRef.current.push(opts ?? {});
      if (!rewardsLoadStartedRef.current) {
        rewardsLoadStartedRef.current = true;
        void import("./BoardTaskCompletionCelebrationRewards").then((m) => {
          setRewardsComponent(() => m.BoardTaskCompletionCelebrationRewards);
        });
      }
    },
    [celebrationSoundsMuted],
  );

  const value = useMemo(
    (): BoardTaskCompletionCelebrationContextValue => ({
      celebrateTaskCompletion,
    }),
    [celebrateTaskCompletion],
  );

  return (
    <BoardTaskCompletionCelebrationContext.Provider value={value}>
      {RewardsComponent ? (
        <RewardsComponent onReady={onRewardsReady} />
      ) : null}
      {children}
    </BoardTaskCompletionCelebrationContext.Provider>
  );
}

export function useBoardTaskCompletionCelebration(): BoardTaskCompletionCelebrationContextValue {
  const ctx = use(BoardTaskCompletionCelebrationContext);
  if (!ctx) {
    throw new Error(
      "useBoardTaskCompletionCelebration must be used within BoardTaskCompletionCelebrationProvider",
    );
  }
  return ctx;
}

export function useBoardTaskCompletionCelebrationOptional(): BoardTaskCompletionCelebrationContextValue | null {
  return use(BoardTaskCompletionCelebrationContext);
}
