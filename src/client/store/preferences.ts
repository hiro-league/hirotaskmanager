import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ALL_TASK_GROUPS,
  sortPrioritiesByValue,
  type GroupDefinition,
  type TaskPriorityDefinition,
} from "../../shared/models";
import {
  isValidYmd,
  type TaskDateFilterMode,
  type TaskDateFilterResolved,
} from "@/components/board/boardStatusUtils";
import type { NotificationFeedSourceFilter } from "../../shared/notifications";

export type ThemePreference = "system" | "light" | "dark";
export type TaskCardViewMode = "small" | "normal" | "large" | "larger";
export type NotificationPanelScopePreference = "all" | "current";

export type { NotificationFeedSourceFilter };

function isNotificationFeedSourceFilter(
  v: unknown,
): v is NotificationFeedSourceFilter {
  return v === "all" || v === "ui" || v === "cli" || v === "system";
}

/** Migrate from legacy `notificationHideOwnWrites` or validate persisted filter. Default `cli`. */
function resolveNotificationSourceFilter(
  s:
    | {
        notificationSourceFilter?: unknown;
        notificationHideOwnWrites?: boolean;
      }
    | undefined,
): NotificationFeedSourceFilter {
  if (s && isNotificationFeedSourceFilter(s.notificationSourceFilter)) {
    return s.notificationSourceFilter;
  }
  if (s?.notificationHideOwnWrites === false) return "all";
  return "cli";
}

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

/** Compact header label for card-size cycling (S / N / L / XL). */
export const TASK_CARD_VIEW_MODE_SHORT: Record<TaskCardViewMode, string> = {
  small: "S",
  normal: "N",
  large: "L",
  larger: "XL",
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

/** Per-board date filter (persisted); `enabled: false` keeps last range/mode for next time. */
export interface TaskDateFilterPersisted {
  enabled: boolean;
  mode: TaskDateFilterMode;
  startDate: string;
  endDate: string;
}

interface PersistedShape {
  state?: {
    themePreference?: ThemePreference;
    sidebarCollapsed?: boolean;
    notificationPanelScopePreference?: NotificationPanelScopePreference;
    /** @deprecated Migrated to `notificationSourceFilter`. */
    notificationHideOwnWrites?: boolean;
    notificationSourceFilter?: NotificationFeedSourceFilter;
    boardFilterStripCollapsed?: boolean;
    activeTaskGroupByBoardId?: Record<string, string>;
    activeTaskPriorityIdsByBoardId?: Record<string, string[]>;
    taskCardViewModeByBoardId?: Record<string, TaskCardViewMode>;
    taskCardSizeByBoardId?: Record<string, TaskCardViewMode>;
    taskDateFilterByBoardId?: Record<string, TaskDateFilterPersisted>;
    /** User checked "don't show again" on board keyboard help — disables auto-open on board selection. */
    boardShortcutHelpDismissed?: boolean;
  };
}

function isTaskDateFilterMode(v: unknown): v is TaskDateFilterMode {
  return v === "opened" || v === "closed" || v === "any";
}

function sanitizeTaskDateFilterMap(
  raw: unknown,
): Record<string, TaskDateFilterPersisted> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, TaskDateFilterPersisted> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const o = value as Record<string, unknown>;
    const mode = o.mode;
    const startDate = o.startDate;
    const endDate = o.endDate;
    if (
      typeof startDate !== "string" ||
      typeof endDate !== "string" ||
      !isTaskDateFilterMode(mode)
    ) {
      continue;
    }
    out[id] = {
      enabled: Boolean(o.enabled),
      mode,
      startDate,
      endDate,
    };
  }
  return out;
}

function readPersistedSlice(): {
  themePreference: ThemePreference;
  sidebarCollapsed: boolean;
  notificationPanelScopePreference: NotificationPanelScopePreference;
  notificationSourceFilter: NotificationFeedSourceFilter;
  boardFilterStripCollapsed: boolean;
  activeTaskGroupByBoardId: Record<string, string>;
  activeTaskPriorityIdsByBoardId: Record<string, string[]>;
  taskCardViewModeByBoardId: Record<string, TaskCardViewMode>;
  taskDateFilterByBoardId: Record<string, TaskDateFilterPersisted>;
  boardShortcutHelpDismissed: boolean;
} {
  if (typeof localStorage === "undefined") {
    return {
      themePreference: "system",
      sidebarCollapsed: false,
      notificationPanelScopePreference: "all",
      notificationSourceFilter: "cli",
      boardFilterStripCollapsed: false,
      activeTaskGroupByBoardId: {},
      activeTaskPriorityIdsByBoardId: {},
      taskCardViewModeByBoardId: {},
      taskDateFilterByBoardId: {},
      boardShortcutHelpDismissed: false,
    };
  }
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return {
        themePreference: "system",
        sidebarCollapsed: false,
        notificationPanelScopePreference: "all",
        notificationSourceFilter: "cli",
        boardFilterStripCollapsed: false,
        activeTaskGroupByBoardId: {},
        activeTaskPriorityIdsByBoardId: {},
        taskCardViewModeByBoardId: {},
        taskDateFilterByBoardId: {},
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
    const taskDateFilterByBoardId = sanitizeTaskDateFilterMap(
      s?.taskDateFilterByBoardId,
    );
    return {
      themePreference:
        s?.themePreference === "light" ||
        s?.themePreference === "dark" ||
        s?.themePreference === "system"
          ? s.themePreference
          : "system",
      sidebarCollapsed: Boolean(s?.sidebarCollapsed),
      notificationPanelScopePreference:
        s?.notificationPanelScopePreference === "current" ? "current" : "all",
      notificationSourceFilter: resolveNotificationSourceFilter(s),
      boardFilterStripCollapsed: Boolean(s?.boardFilterStripCollapsed),
      activeTaskGroupByBoardId,
      activeTaskPriorityIdsByBoardId,
      taskCardViewModeByBoardId,
      taskDateFilterByBoardId,
      boardShortcutHelpDismissed: Boolean(s?.boardShortcutHelpDismissed),
    };
  } catch {
    return {
      themePreference: "system",
      sidebarCollapsed: false,
      notificationPanelScopePreference: "all",
      notificationSourceFilter: "cli",
      boardFilterStripCollapsed: false,
      activeTaskGroupByBoardId: {},
      activeTaskPriorityIdsByBoardId: {},
      taskCardViewModeByBoardId: {},
      taskDateFilterByBoardId: {},
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
  notificationPanelScopePreference: NotificationPanelScopePreference;
  setNotificationPanelScopePreference: (v: NotificationPanelScopePreference) => void;
  notificationSourceFilter: NotificationFeedSourceFilter;
  setNotificationSourceFilter: (v: NotificationFeedSourceFilter) => void;
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
  taskDateFilterByBoardId: Record<string, TaskDateFilterPersisted>;
  setTaskDateFilterForBoard: (
    boardId: string | number,
    filter: TaskDateFilterPersisted,
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
      notificationPanelScopePreference: initial.notificationPanelScopePreference,
      setNotificationPanelScopePreference: (notificationPanelScopePreference) =>
        set({ notificationPanelScopePreference }),
      notificationSourceFilter: initial.notificationSourceFilter,
      setNotificationSourceFilter: (notificationSourceFilter) =>
        set({ notificationSourceFilter }),
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
      taskDateFilterByBoardId: initial.taskDateFilterByBoardId,
      setTaskDateFilterForBoard: (boardId, filter) =>
        set((s) => ({
          taskDateFilterByBoardId: {
            ...s.taskDateFilterByBoardId,
            [String(boardId)]: { ...filter },
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
          const nextTaskDateFilterByBoardId = Object.fromEntries(
            Object.entries(s.taskDateFilterByBoardId).filter(([id]) =>
              validIds.has(id),
            ),
          );
          if (
            Object.keys(nextActiveTaskGroupByBoardId).length ===
              Object.keys(s.activeTaskGroupByBoardId).length &&
            Object.keys(nextActiveTaskPriorityIdsByBoardId).length ===
              Object.keys(s.activeTaskPriorityIdsByBoardId).length &&
            Object.keys(nextTaskCardViewModeByBoardId).length ===
              Object.keys(s.taskCardViewModeByBoardId).length &&
            Object.keys(nextTaskDateFilterByBoardId).length ===
              Object.keys(s.taskDateFilterByBoardId).length
          ) {
            return s;
          }
          // SQLite board ids can be reused after deletions, so stale board-local prefs must be
          // pruned or a new board can inherit an old group filter/card size from the recycled id.
          return {
            activeTaskGroupByBoardId: nextActiveTaskGroupByBoardId,
            activeTaskPriorityIdsByBoardId: nextActiveTaskPriorityIdsByBoardId,
            taskCardViewModeByBoardId: nextTaskCardViewModeByBoardId,
            taskDateFilterByBoardId: nextTaskDateFilterByBoardId,
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
        notificationPanelScopePreference: state.notificationPanelScopePreference,
        notificationSourceFilter: state.notificationSourceFilter,
        boardFilterStripCollapsed: state.boardFilterStripCollapsed,
        activeTaskGroupByBoardId: state.activeTaskGroupByBoardId,
        activeTaskPriorityIdsByBoardId: state.activeTaskPriorityIdsByBoardId,
        taskCardViewModeByBoardId: state.taskCardViewModeByBoardId,
        taskDateFilterByBoardId: state.taskDateFilterByBoardId,
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

/**
 * When the date filter is enabled and dates are valid, returns the inclusive range for task matching.
 */
export function useResolvedTaskDateFilter(
  boardId: string | number,
): TaskDateFilterResolved | null {
  const key = String(boardId);
  const raw = usePreferencesStore((s) => s.taskDateFilterByBoardId[key]);
  return useMemo(() => {
    if (!raw?.enabled) return null;
    if (!isValidYmd(raw.startDate) || !isValidYmd(raw.endDate)) return null;
    let startDate = raw.startDate;
    let endDate = raw.endDate;
    if (startDate > endDate) {
      const t = startDate;
      startDate = endDate;
      endDate = t;
    }
    const mode: TaskDateFilterMode = isTaskDateFilterMode(raw.mode)
      ? raw.mode
      : "any";
    return { mode, startDate, endDate };
  }, [raw, key]);
}
