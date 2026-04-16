import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NotificationFeedSourceFilter } from "../../shared/notifications";

export type ThemePreference = "system" | "light" | "dark";
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

export const PREFERENCES_STORAGE_KEY = "tm-preferences";

interface PersistedShape {
  state?: {
    themePreference?: ThemePreference;
    sidebarCollapsed?: boolean;
    notificationPanelScopePreference?: NotificationPanelScopePreference;
    /** @deprecated Migrated to `notificationSourceFilter`. */
    notificationHideOwnWrites?: boolean;
    notificationSourceFilter?: NotificationFeedSourceFilter;
    boardFilterStripCollapsed?: boolean;
    /** User checked "don't show again" on board keyboard help — disables auto-open on board selection. */
    boardShortcutHelpDismissed?: boolean;
  };
}

function readPersistedSlice(): {
  themePreference: ThemePreference;
  sidebarCollapsed: boolean;
  notificationPanelScopePreference: NotificationPanelScopePreference;
  notificationSourceFilter: NotificationFeedSourceFilter;
  boardFilterStripCollapsed: boolean;
  boardShortcutHelpDismissed: boolean;
} {
  if (typeof localStorage === "undefined") {
    return {
      themePreference: "system",
      sidebarCollapsed: false,
      notificationPanelScopePreference: "all",
      notificationSourceFilter: "cli",
      boardFilterStripCollapsed: false,
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
        boardShortcutHelpDismissed: false,
      };
    }
    const parsed = JSON.parse(raw) as PersistedShape;
    const s = parsed.state;
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
      boardShortcutHelpDismissed: Boolean(s?.boardShortcutHelpDismissed),
    };
  } catch {
    return {
      themePreference: "system",
      sidebarCollapsed: false,
      notificationPanelScopePreference: "all",
      notificationSourceFilter: "cli",
      boardFilterStripCollapsed: false,
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
        boardShortcutHelpDismissed: state.boardShortcutHelpDismissed,
      }),
    },
  ),
);
export type {
  TaskCardViewMode,
  TaskCardViewSpec,
  TaskDateFilterPersisted,
} from "./boardFilters";
export {
  BOARD_FILTERS_STORAGE_KEY,
  getNextTaskCardViewMode,
  getTaskCardViewSpec,
  TASK_CARD_VIEW_MODE_LABELS,
  TASK_CARD_VIEW_MODE_ORDER,
  TASK_CARD_VIEW_MODE_SHORT,
  useBoardFiltersStore,
  useResolvedActiveReleaseIds,
  useResolvedActiveTaskGroupIds,
  useResolvedActiveTaskPriorityIds,
  useResolvedTaskCardViewMode,
  useResolvedTaskDateFilter,
} from "./boardFilters";
