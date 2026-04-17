import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { RELEASE_FILTER_UNTAGGED } from "../../shared/boardFilters";
import {
  sortPrioritiesByValue,
  type GroupDefinition,
  type ReleaseDefinition,
  type TaskPriorityDefinition,
} from "../../shared/models";
import {
  isValidYmd,
  type TaskDateFilterMode,
  type TaskDateFilterResolved,
} from "@/components/board/boardStatusUtils";

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
    previewMaxLength: 90,
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

export const BOARD_FILTERS_STORAGE_KEY = "tm-board-filters";

/** Per-board date filter (persisted); `enabled: false` keeps last range/mode for next time. */
export interface TaskDateFilterPersisted {
  enabled: boolean;
  mode: TaskDateFilterMode;
  startDate: string;
  endDate: string;
}

interface PersistedShape {
  state?: {
    /** @deprecated Migrated to `activeTaskGroupIdsByBoardId`. */
    activeTaskGroupByBoardId?: Record<string, string>;
    activeTaskGroupIdsByBoardId?: Record<string, string[]>;
    activeTaskPriorityIdsByBoardId?: Record<string, string[]>;
    /** Board release filter selections; values are release id strings and/or {@link RELEASE_FILTER_UNTAGGED}. */
    activeReleaseIdsByBoardId?: Record<string, string[]>;
    taskCardViewModeByBoardId?: Record<string, TaskCardViewMode>;
    taskCardSizeByBoardId?: Record<string, TaskCardViewMode>;
    taskDateFilterByBoardId?: Record<string, TaskDateFilterPersisted>;
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

function sanitizeActiveTaskGroupIdsMap(
  raw: unknown,
  legacyRaw: unknown,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [id, value] of Object.entries(raw)) {
      if (!Array.isArray(value)) continue;
      const ids = value.filter((entry): entry is string => typeof entry === "string");
      if (ids.length > 0) out[id] = ids;
    }
  }
  if (legacyRaw && typeof legacyRaw === "object" && !Array.isArray(legacyRaw)) {
    for (const [id, value] of Object.entries(legacyRaw)) {
      if (typeof value !== "string" || value.trim().length === 0 || out[id] != null) {
        continue;
      }
      out[id] = [value];
    }
  }
  return out;
}

interface BoardFiltersPersistedState {
  activeTaskGroupIdsByBoardId: Record<string, string[]>;
  activeTaskPriorityIdsByBoardId: Record<string, string[]>;
  activeReleaseIdsByBoardId: Record<string, string[]>;
  taskCardViewModeByBoardId: Record<string, TaskCardViewMode>;
  taskDateFilterByBoardId: Record<string, TaskDateFilterPersisted>;
}

const EMPTY_BOARD_FILTERS_STATE: BoardFiltersPersistedState = {
  activeTaskGroupIdsByBoardId: {},
  activeTaskPriorityIdsByBoardId: {},
  activeReleaseIdsByBoardId: {},
  taskCardViewModeByBoardId: {},
  taskDateFilterByBoardId: {},
};

function readPersistedSlice(): BoardFiltersPersistedState {
  if (typeof localStorage === "undefined") {
    return EMPTY_BOARD_FILTERS_STATE;
  }
  try {
    const raw = localStorage.getItem(BOARD_FILTERS_STORAGE_KEY);
    if (!raw) return EMPTY_BOARD_FILTERS_STATE;
    const parsed = JSON.parse(raw) as PersistedShape;
    const s = parsed.state;
    const rawGroupIdsMap = s?.activeTaskGroupIdsByBoardId;
    const legacyGroupMap = s?.activeTaskGroupByBoardId;
    const rawPriorityMap = s?.activeTaskPriorityIdsByBoardId;
    const activeTaskGroupIdsByBoardId = sanitizeActiveTaskGroupIdsMap(
      rawGroupIdsMap,
      legacyGroupMap,
    );
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
    const rawReleaseMap = s?.activeReleaseIdsByBoardId;
    const activeReleaseIdsByBoardId =
      rawReleaseMap &&
      typeof rawReleaseMap === "object" &&
      !Array.isArray(rawReleaseMap)
        ? Object.fromEntries(
            Object.entries(rawReleaseMap).filter(
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
      activeTaskGroupIdsByBoardId,
      activeTaskPriorityIdsByBoardId,
      activeReleaseIdsByBoardId,
      taskCardViewModeByBoardId,
      taskDateFilterByBoardId,
    };
  } catch {
    return EMPTY_BOARD_FILTERS_STATE;
  }
}

const initial = readPersistedSlice();

interface BoardFiltersState extends BoardFiltersPersistedState {
  setActiveTaskGroupIdsForBoard: (
    boardId: string | number,
    groupIds: string[] | undefined,
  ) => void;
  setActiveTaskPriorityIdsForBoard: (
    boardId: string | number,
    priorityIds: string[] | undefined,
  ) => void;
  setActiveReleaseIdsForBoard: (
    boardId: string | number,
    releaseIds: string[] | undefined,
  ) => void;
  setTaskDateFilterForBoard: (
    boardId: string | number,
    filter: TaskDateFilterPersisted,
  ) => void;
  setTaskCardViewModeForBoard: (
    boardId: string | number,
    mode: TaskCardViewMode,
  ) => void;
  pruneBoardScopedPreferences: (boardIds: Iterable<string | number>) => void;
}

export const useBoardFiltersStore = create<BoardFiltersState>()(
  persist(
    (set) => ({
      activeTaskGroupIdsByBoardId: initial.activeTaskGroupIdsByBoardId,
      setActiveTaskGroupIdsForBoard: (boardId, groupIds) =>
        set((s) => {
          const key = String(boardId);
          const next = { ...s.activeTaskGroupIdsByBoardId };
          if (groupIds === undefined || groupIds.length === 0) {
            delete next[key];
          } else {
            next[key] = [...groupIds];
          }
          return { activeTaskGroupIdsByBoardId: next };
        }),
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
      activeReleaseIdsByBoardId: initial.activeReleaseIdsByBoardId,
      setActiveReleaseIdsForBoard: (boardId, releaseIds) =>
        set((s) => {
          const key = String(boardId);
          const next = { ...s.activeReleaseIdsByBoardId };
          if (releaseIds === undefined) {
            delete next[key];
          } else {
            next[key] = [...releaseIds];
          }
          return { activeReleaseIdsByBoardId: next };
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
          const nextActiveTaskGroupIdsByBoardId = Object.fromEntries(
            Object.entries(s.activeTaskGroupIdsByBoardId).filter(([id]) =>
              validIds.has(id),
            ),
          );
          const nextActiveTaskPriorityIdsByBoardId = Object.fromEntries(
            Object.entries(s.activeTaskPriorityIdsByBoardId).filter(([id]) =>
              validIds.has(id),
            ),
          );
          const nextActiveReleaseIdsByBoardId = Object.fromEntries(
            Object.entries(s.activeReleaseIdsByBoardId).filter(([id]) =>
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
            Object.keys(nextActiveTaskGroupIdsByBoardId).length ===
              Object.keys(s.activeTaskGroupIdsByBoardId).length &&
            Object.keys(nextActiveTaskPriorityIdsByBoardId).length ===
              Object.keys(s.activeTaskPriorityIdsByBoardId).length &&
            Object.keys(nextActiveReleaseIdsByBoardId).length ===
              Object.keys(s.activeReleaseIdsByBoardId).length &&
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
            activeTaskGroupIdsByBoardId: nextActiveTaskGroupIdsByBoardId,
            activeTaskPriorityIdsByBoardId: nextActiveTaskPriorityIdsByBoardId,
            activeReleaseIdsByBoardId: nextActiveReleaseIdsByBoardId,
            taskCardViewModeByBoardId: nextTaskCardViewModeByBoardId,
            taskDateFilterByBoardId: nextTaskDateFilterByBoardId,
          };
        }),
    }),
    {
      name: BOARD_FILTERS_STORAGE_KEY,
      // Priority 3 (client-localstorage-schema): baseline version for future `migrate` steps.
      version: 1,
      migrate: (persistedState, _version) => persistedState as BoardFiltersState,
      partialize: (state) => ({
        activeTaskGroupIdsByBoardId: state.activeTaskGroupIdsByBoardId,
        activeTaskPriorityIdsByBoardId: state.activeTaskPriorityIdsByBoardId,
        activeReleaseIdsByBoardId: state.activeReleaseIdsByBoardId,
        taskCardViewModeByBoardId: state.taskCardViewModeByBoardId,
        taskDateFilterByBoardId: state.taskDateFilterByBoardId,
      }),
    },
  ),
);

/**
 * Subscribe to board-local group ids and drop stale references when task group definitions change.
 * `null` means "all groups" so empty picker state and legacy missing prefs behave the same way.
 */
export function useResolvedActiveTaskGroupIds(
  boardId: string | number,
  taskGroups: GroupDefinition[],
): string[] | null {
  const key = String(boardId);
  const raw = useBoardFiltersStore(
    (s) => s.activeTaskGroupIdsByBoardId[key],
  );
  return useMemo(() => {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const validIds = new Set(taskGroups.map((group) => String(group.groupId)));
    const filtered = raw.filter((id) => validIds.has(id));
    return filtered.length > 0 ? filtered : null;
  }, [raw, taskGroups]);
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
  const raw = useBoardFiltersStore(
    (s) => s.activeTaskPriorityIdsByBoardId[key],
  );
  return useMemo(() => {
    if (raw === undefined) return null;
    if (!Array.isArray(raw)) return null;
    if (raw.length === 0) return [];
    const validIds = new Set(
      sortPrioritiesByValue(taskPriorities).map((priority) => String(priority.priorityId)),
    );
    const filtered = raw.filter((id) => validIds.has(id));
    return filtered.length > 0 ? filtered : null;
  }, [raw, taskPriorities]);
}

/**
 * `null` = all releases; `[]` = explicit empty filter; otherwise OR across valid release ids
 * and/or the untagged sentinel.
 */
export function useResolvedActiveReleaseIds(
  boardId: string | number,
  releases: ReleaseDefinition[],
): string[] | null {
  const key = String(boardId);
  const raw = useBoardFiltersStore((s) => s.activeReleaseIdsByBoardId[key]);
  return useMemo(() => {
    if (raw === undefined) return null;
    if (!Array.isArray(raw)) return null;
    if (raw.length === 0) return [];
    const validIds = new Set(releases.map((r) => String(r.releaseId)));
    const filtered = raw.filter(
      (id) => id === RELEASE_FILTER_UNTAGGED || validIds.has(id),
    );
    return filtered.length > 0 ? filtered : null;
  }, [raw, releases]);
}

export function useResolvedTaskCardViewMode(boardId: string | number): TaskCardViewMode {
  const key = String(boardId);
  const raw = useBoardFiltersStore((s) => s.taskCardViewModeByBoardId[key]);
  return isTaskCardViewMode(raw) ? raw : "normal";
}

/**
 * When the date filter is enabled and dates are valid, returns the inclusive range for task matching.
 */
export function useResolvedTaskDateFilter(
  boardId: string | number,
): TaskDateFilterResolved | null {
  const key = String(boardId);
  const raw = useBoardFiltersStore((s) => s.taskDateFilterByBoardId[key]);
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
