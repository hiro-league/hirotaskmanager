import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ALL_TASK_GROUPS, type GroupDefinition } from "../../shared/models";

export type ThemePreference = "system" | "light" | "dark";
export type TaskCardSizePreference = "normal" | "large" | "larger" | "small";

export const PREFERENCES_STORAGE_KEY = "tm-preferences";

interface PersistedShape {
  state?: {
    themePreference?: ThemePreference;
    sidebarCollapsed?: boolean;
    boardFilterStripCollapsed?: boolean;
    activeTaskGroupByBoardId?: Record<string, string>;
    taskCardSizeByBoardId?: Record<string, TaskCardSizePreference>;
    /** User checked "don't show again" on board keyboard help — disables auto-open on board selection. */
    boardShortcutHelpDismissed?: boolean;
  };
}

function readPersistedSlice(): {
  themePreference: ThemePreference;
  sidebarCollapsed: boolean;
  boardFilterStripCollapsed: boolean;
  activeTaskGroupByBoardId: Record<string, string>;
  taskCardSizeByBoardId: Record<string, TaskCardSizePreference>;
  boardShortcutHelpDismissed: boolean;
} {
  if (typeof localStorage === "undefined") {
    return {
      themePreference: "system",
      sidebarCollapsed: false,
      boardFilterStripCollapsed: false,
      activeTaskGroupByBoardId: {},
      taskCardSizeByBoardId: {},
      boardShortcutHelpDismissed: false,
    };
  }
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return {
        themePreference: "system",
        sidebarCollapsed: false,
        boardFilterStripCollapsed: false,
        activeTaskGroupByBoardId: {},
        taskCardSizeByBoardId: {},
        boardShortcutHelpDismissed: false,
      };
    }
    const parsed = JSON.parse(raw) as PersistedShape;
    const s = parsed.state;
    const rawMap = s?.activeTaskGroupByBoardId;
    const activeTaskGroupByBoardId =
      rawMap && typeof rawMap === "object" && !Array.isArray(rawMap)
        ? { ...rawMap }
        : {};
    const rawTaskCardSizeMap = s?.taskCardSizeByBoardId;
    // Keep card-size cycling user-local per board until the visual sizing behavior is wired.
    const taskCardSizeByBoardId =
      rawTaskCardSizeMap &&
      typeof rawTaskCardSizeMap === "object" &&
      !Array.isArray(rawTaskCardSizeMap)
        ? Object.fromEntries(
            Object.entries(rawTaskCardSizeMap).filter(([, value]) =>
              value === "normal" ||
              value === "large" ||
              value === "larger" ||
              value === "small",
            ),
          )
        : {};
    return {
      themePreference:
        s?.themePreference === "light" ||
        s?.themePreference === "dark" ||
        s?.themePreference === "system"
          ? s.themePreference
          : "system",
      sidebarCollapsed: Boolean(s?.sidebarCollapsed),
      boardFilterStripCollapsed: Boolean(s?.boardFilterStripCollapsed),
      activeTaskGroupByBoardId,
      taskCardSizeByBoardId,
      boardShortcutHelpDismissed: Boolean(s?.boardShortcutHelpDismissed),
    };
  } catch {
    return {
      themePreference: "system",
      sidebarCollapsed: false,
      boardFilterStripCollapsed: false,
      activeTaskGroupByBoardId: {},
      taskCardSizeByBoardId: {},
      boardShortcutHelpDismissed: false,
    };
  }
}

const initial = readPersistedSlice();

interface PreferencesState {
  themePreference: ThemePreference;
  setThemePreference: (v: ThemePreference) => void;
  sidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  boardFilterStripCollapsed: boolean;
  setBoardFilterStripCollapsed: (v: boolean) => void;
  toggleBoardFilterStripCollapsed: () => void;
  activeTaskGroupByBoardId: Record<string, string>;
  setActiveTaskGroupForBoard: (boardId: string | number, group: string) => void;
  taskCardSizeByBoardId: Record<string, TaskCardSizePreference>;
  setTaskCardSizeForBoard: (
    boardId: string | number,
    size: TaskCardSizePreference,
  ) => void;
  pruneBoardScopedPreferences: (boardIds: Iterable<string | number>) => void;
  boardShortcutHelpDismissed: boolean;
  setBoardShortcutHelpDismissed: (v: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      themePreference: initial.themePreference,
      setThemePreference: (themePreference) => set({ themePreference }),
      sidebarCollapsed: initial.sidebarCollapsed,
      toggleSidebarCollapsed: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      boardFilterStripCollapsed: initial.boardFilterStripCollapsed,
      setBoardFilterStripCollapsed: (boardFilterStripCollapsed) =>
        set({ boardFilterStripCollapsed }),
      toggleBoardFilterStripCollapsed: () =>
        set((s) => ({
          boardFilterStripCollapsed: !s.boardFilterStripCollapsed,
        })),
      activeTaskGroupByBoardId: initial.activeTaskGroupByBoardId,
      setActiveTaskGroupForBoard: (boardId, group) =>
        set((s) => ({
          activeTaskGroupByBoardId: {
            ...s.activeTaskGroupByBoardId,
            [String(boardId)]: group,
          },
        })),
      taskCardSizeByBoardId: initial.taskCardSizeByBoardId,
      setTaskCardSizeForBoard: (boardId, size) =>
        set((s) => ({
          taskCardSizeByBoardId: {
            ...s.taskCardSizeByBoardId,
            [String(boardId)]: size,
          },
        })),
      pruneBoardScopedPreferences: (boardIds) =>
        set((s) => {
          const validIds = new Set(Array.from(boardIds, (id) => String(id)));
          const nextActiveTaskGroupByBoardId = Object.fromEntries(
            Object.entries(s.activeTaskGroupByBoardId).filter(([id]) =>
              validIds.has(id),
            ),
          );
          const nextTaskCardSizeByBoardId = Object.fromEntries(
            Object.entries(s.taskCardSizeByBoardId).filter(([id]) =>
              validIds.has(id),
            ),
          );
          if (
            Object.keys(nextActiveTaskGroupByBoardId).length ===
              Object.keys(s.activeTaskGroupByBoardId).length &&
            Object.keys(nextTaskCardSizeByBoardId).length ===
              Object.keys(s.taskCardSizeByBoardId).length
          ) {
            return s;
          }
          // SQLite board ids can be reused after deletions, so stale board-local prefs must be
          // pruned or a new board can inherit an old group filter/card size from the recycled id.
          return {
            activeTaskGroupByBoardId: nextActiveTaskGroupByBoardId,
            taskCardSizeByBoardId: nextTaskCardSizeByBoardId,
          };
        }),
      boardShortcutHelpDismissed: initial.boardShortcutHelpDismissed,
      setBoardShortcutHelpDismissed: (boardShortcutHelpDismissed) =>
        set({ boardShortcutHelpDismissed }),
    }),
    {
      name: PREFERENCES_STORAGE_KEY,
      partialize: (state) => ({
        themePreference: state.themePreference,
        sidebarCollapsed: state.sidebarCollapsed,
        boardFilterStripCollapsed: state.boardFilterStripCollapsed,
        activeTaskGroupByBoardId: state.activeTaskGroupByBoardId,
        taskCardSizeByBoardId: state.taskCardSizeByBoardId,
        boardShortcutHelpDismissed: state.boardShortcutHelpDismissed,
      }),
    },
  ),
);

/** Subscribe to prefs and validate against current `taskGroups` ids. */
export function useResolvedActiveTaskGroup(
  boardId: string | number,
  taskGroups: GroupDefinition[],
): string {
  const key = String(boardId);
  const raw = usePreferencesStore(
    (s) => s.activeTaskGroupByBoardId[key],
  );
  return useMemo(() => {
    if (raw === ALL_TASK_GROUPS) return ALL_TASK_GROUPS;
    if (raw && taskGroups.some((g) => String(g.id) === raw)) return raw;
    return ALL_TASK_GROUPS;
  }, [raw, key, taskGroups]);
}

export function useResolvedTaskCardSize(boardId: string | number): TaskCardSizePreference {
  const key = String(boardId);
  const raw = usePreferencesStore((s) => s.taskCardSizeByBoardId[key]);
  return raw === "large" || raw === "larger" || raw === "small" ? raw : "normal";
}
