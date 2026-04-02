import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ALL_TASK_GROUPS,
  sortPrioritiesByValue,
  type GroupDefinition,
  type TaskPriorityDefinition,
} from "../../shared/models";

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
    activeTaskPriorityIdsByBoardId?: Record<string, string[]>;
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
  activeTaskPriorityIdsByBoardId: Record<string, string[]>;
  taskCardViewModeByBoardId: Record<string, TaskCardViewMode>;
  boardShortcutHelpDismissed: boolean;
} {
  if (typeof localStorage === "undefined") {
    return {
      themePreference: "system",
      sidebarCollapsed: false,
      boardFilterStripCollapsed: false,
      activeTaskGroupByBoardId: {},
      activeTaskPriorityIdsByBoardId: {},
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
        activeTaskPriorityIdsByBoardId: {},
        taskCardViewModeByBoardId: {},
        boardShortcutHelpDismissed: false,
      };
    }
    const parsed = JSON.parse(raw) as PersistedShape;
    const s = parsed.state;
    const rawMap = s?.activeTaskGroupByBoardId;
    const rawPriorityMap = s?.activeTaskPriorityIdsByBoardId;
    const activeTaskGroupByBoardId =
      rawMap && typeof rawMap === "object" && !Array.isArray(rawMap)
        ? { ...rawMap }
        : {};
    const activeTaskPriorityIdsByBoardId =
      rawPriorityMap &&
      typeof rawPriorityMap === "object" &&
      !Array.isArray(rawPriorityMap)
        ? Object.fromEntries(
            Object.entries(rawPriorityMap).filter(
              ([, value]) =>
                Array.isArray(value) &&
                value.every((entry) => typeof entry === "string"),
            ),
          )
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
      activeTaskPriorityIdsByBoardId,
      taskCardViewModeByBoardId,
      boardShortcutHelpDismissed: Boolean(s?.boardShortcutHelpDismissed),
    };
  } catch {
    return {
      themePreference: "system",
      sidebarCollapsed: false,
      boardFilterStripCollapsed: false,
      activeTaskGroupByBoardId: {},
      activeTaskPriorityIdsByBoardId: {},
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
  activeTaskPriorityIdsByBoardId: Record<string, string[]>;
  setActiveTaskPriorityIdsForBoard: (
    boardId: string | number,
    priorityIds: string[] | undefined,
  ) => void;
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
      activeTaskPriorityIdsByBoardId: initial.activeTaskPriorityIdsByBoardId,
      setActiveTaskPriorityIdsForBoard: (boardId, priorityIds) =>
        set((s) => {
          const key = String(boardId);
          const next = { ...s.activeTaskPriorityIdsByBoardId };
          if (priorityIds === undefined) {
            delete next[key];
          } else {
            next[key] = [...priorityIds];
          }
          return { activeTaskPriorityIdsByBoardId: next };
        }),
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
          const nextActiveTaskPriorityIdsByBoardId = Object.fromEntries(
            Object.entries(s.activeTaskPriorityIdsByBoardId).filter(([id]) =>
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
            Object.keys(nextActiveTaskPriorityIdsByBoardId).length ===
              Object.keys(s.activeTaskPriorityIdsByBoardId).length &&
            Object.keys(nextTaskCardViewModeByBoardId).length ===
              Object.keys(s.taskCardViewModeByBoardId).length
          ) {
            return s;
          }
          // SQLite board ids can be reused after deletions, so stale board-local prefs must be
          // pruned or a new board can inherit an old group filter/card size from the recycled id.
          return {
            activeTaskGroupByBoardId: nextActiveTaskGroupByBoardId,
            activeTaskPriorityIdsByBoardId: nextActiveTaskPriorityIdsByBoardId,
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
        activeTaskPriorityIdsByBoardId: state.activeTaskPriorityIdsByBoardId,
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

/**
 * Returns `null` for All priorities, `[]` for an explicit empty filter, or the
 * current valid selected ids after removing stale priority references.
 */
export function useResolvedActiveTaskPriorityIds(
  boardId: string | number,
  taskPriorities: TaskPriorityDefinition[],
): string[] | null {
  const key = String(boardId);
  const raw = usePreferencesStore(
    (s) => s.activeTaskPriorityIdsByBoardId[key],
  );
  return useMemo(() => {
    if (raw === undefined) return null;
    if (!Array.isArray(raw)) return null;
    if (raw.length === 0) return [];
    const validIds = new Set(
      sortPrioritiesByValue(taskPriorities).map((priority) => String(priority.id)),
    );
    const filtered = raw.filter((id) => validIds.has(id));
    return filtered.length > 0 ? filtered : null;
  }, [raw, taskPriorities]);
}

export function useResolvedTaskCardViewMode(boardId: string | number): TaskCardViewMode {
  const key = String(boardId);
  const raw = usePreferencesStore((s) => s.taskCardViewModeByBoardId[key]);
  return isTaskCardViewMode(raw) ? raw : "normal";
}
