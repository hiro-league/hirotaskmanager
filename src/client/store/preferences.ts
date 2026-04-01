import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ALL_TASK_GROUPS, type GroupDefinition } from "../../shared/models";

export type ThemePreference = "system" | "light" | "dark";
export type TaskCardViewMode = "small" | "normal" | "large" | "larger";

export const TASK_CARD_VIEW_MODE_ORDER: TaskCardViewMode[] = [
  "small",
  "normal",
  "large",
  "larger",
];

export const TASK_CARD_VIEW_MODE_LABELS: Record<TaskCardViewMode, string> = {
  small: "Small",
  normal: "Normal",
  large: "Large",
  larger: "Larger",
};

export interface TaskCardViewSpec {
  containerClassName?: string;
  titleClassName?: string;
  showGroupLabel: boolean;
  showDescriptionPreview: boolean;
  previewClassName?: string;
  previewMaxLength: number;
}

// Keep card-mode behavior data-driven so new views stay out of TaskCard's render logic.
const TASK_CARD_VIEW_SPECS: Record<TaskCardViewMode, TaskCardViewSpec> = {
  small: {
    containerClassName: "px-2 py-1.5",
    titleClassName: "text-xs leading-tight",
    showGroupLabel: false,
    showDescriptionPreview: false,
    previewMaxLength: 0,
  },
  normal: {
    showGroupLabel: false,
    showDescriptionPreview: false,
    previewMaxLength: 0,
  },
  large: {
    showGroupLabel: true,
    showDescriptionPreview: false,
    previewMaxLength: 0,
  },
  larger: {
    showGroupLabel: true,
    showDescriptionPreview: true,
    previewClassName: "line-clamp-2",
    previewMaxLength: 140,
  },
};

function isTaskCardViewMode(value: unknown): value is TaskCardViewMode {
  return (
    value === "small" ||
    value === "normal" ||
    value === "large" ||
    value === "larger"
  );
}

export function getNextTaskCardViewMode(mode: TaskCardViewMode): TaskCardViewMode {
  const index = TASK_CARD_VIEW_MODE_ORDER.indexOf(mode);
  return TASK_CARD_VIEW_MODE_ORDER[(index + 1) % TASK_CARD_VIEW_MODE_ORDER.length] ?? "normal";
}

export function getTaskCardViewSpec(mode: TaskCardViewMode): TaskCardViewSpec {
  return TASK_CARD_VIEW_SPECS[mode];
}

export const PREFERENCES_STORAGE_KEY = "tm-preferences";

interface PersistedShape {
  state?: {
    themePreference?: ThemePreference;
    sidebarCollapsed?: boolean;
    boardFilterStripCollapsed?: boolean;
    activeTaskGroupByBoardId?: Record<string, string>;
    taskCardViewModeByBoardId?: Record<string, TaskCardViewMode>;
    taskCardSizeByBoardId?: Record<string, TaskCardViewMode>;
    /** User checked "don't show again" on board keyboard help — disables auto-open on board selection. */
    boardShortcutHelpDismissed?: boolean;
  };
}

function readPersistedSlice(): {
  themePreference: ThemePreference;
  sidebarCollapsed: boolean;
  boardFilterStripCollapsed: boolean;
  activeTaskGroupByBoardId: Record<string, string>;
  taskCardViewModeByBoardId: Record<string, TaskCardViewMode>;
  boardShortcutHelpDismissed: boolean;
} {
  if (typeof localStorage === "undefined") {
    return {
      themePreference: "system",
      sidebarCollapsed: false,
      boardFilterStripCollapsed: false,
      activeTaskGroupByBoardId: {},
      taskCardViewModeByBoardId: {},
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
        taskCardViewModeByBoardId: {},
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
    const rawTaskCardViewModeMap =
      s?.taskCardViewModeByBoardId ?? s?.taskCardSizeByBoardId;
    // Migrate the older "size" key to the newer view-mode concept without losing board-local prefs.
    const taskCardViewModeByBoardId =
      rawTaskCardViewModeMap &&
      typeof rawTaskCardViewModeMap === "object" &&
      !Array.isArray(rawTaskCardViewModeMap)
        ? Object.fromEntries(
            Object.entries(rawTaskCardViewModeMap).filter(([, value]) =>
              isTaskCardViewMode(value),
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
      taskCardViewModeByBoardId,
      boardShortcutHelpDismissed: Boolean(s?.boardShortcutHelpDismissed),
    };
  } catch {
    return {
      themePreference: "system",
      sidebarCollapsed: false,
      boardFilterStripCollapsed: false,
      activeTaskGroupByBoardId: {},
      taskCardViewModeByBoardId: {},
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
  taskCardViewModeByBoardId: Record<string, TaskCardViewMode>;
  setTaskCardViewModeForBoard: (
    boardId: string | number,
    mode: TaskCardViewMode,
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
      taskCardViewModeByBoardId: initial.taskCardViewModeByBoardId,
      setTaskCardViewModeForBoard: (boardId, mode) =>
        set((s) => ({
          taskCardViewModeByBoardId: {
            ...s.taskCardViewModeByBoardId,
            [String(boardId)]: mode,
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
          const nextTaskCardViewModeByBoardId = Object.fromEntries(
            Object.entries(s.taskCardViewModeByBoardId).filter(([id]) =>
              validIds.has(id),
            ),
          );
          if (
            Object.keys(nextActiveTaskGroupByBoardId).length ===
              Object.keys(s.activeTaskGroupByBoardId).length &&
            Object.keys(nextTaskCardViewModeByBoardId).length ===
              Object.keys(s.taskCardViewModeByBoardId).length
          ) {
            return s;
          }
          // SQLite board ids can be reused after deletions, so stale board-local prefs must be
          // pruned or a new board can inherit an old group filter/card size from the recycled id.
          return {
            activeTaskGroupByBoardId: nextActiveTaskGroupByBoardId,
            taskCardViewModeByBoardId: nextTaskCardViewModeByBoardId,
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
        taskCardViewModeByBoardId: state.taskCardViewModeByBoardId,
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

export function useResolvedTaskCardViewMode(boardId: string | number): TaskCardViewMode {
  const key = String(boardId);
  const raw = usePreferencesStore((s) => s.taskCardViewModeByBoardId[key]);
  return isTaskCardViewMode(raw) ? raw : "normal";
}
