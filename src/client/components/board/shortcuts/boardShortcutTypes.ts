import type { Board } from "../../../../shared/models";
import type { ShortcutScope } from "./shortcutScopeTypes";

export type { ShortcutScope };

/** Actions wired in BoardView; registry runs use this instead of importing the store directly. */
export interface BoardShortcutActions {
  openHelp: () => void;
  /** K or F3 — open board task search (same as header control). */
  openBoardSearch: () => void;
  toggleFilters: () => void;
  /** S — cycle the board-local task card view mode. */
  cycleTaskCardViewMode: (board: Board) => void;
  /** V — toggle lanes vs stacked board layout (same as header layout control). */
  toggleBoardLayout: (board: Board) => void;
  /** 1 / Num 1 — cycle All → group1 → group2 → … → All. No-op if there are no groups. */
  cycleTaskGroup: (board: Board) => void;
  allTaskGroups: (board: Board) => void;
  /** 2 — cycle All → priority1 → priority2 → … → All using board-local numeric order. */
  cycleTaskPriority: (board: Board) => void;
  /** Cycle the highlighted task's assigned group, debounced before persisting. */
  cycleHighlightedTaskGroup: (board: Board) => void;
  /** Cycle the highlighted task's assigned priority, debounced before persisting. */
  cycleHighlightedTaskPriority: (board: Board) => void;
  /** Tab — focus the hovered task or list, else fall back to the current highlight. */
  focusOrScrollHighlight: () => void;
  moveHighlight: (dir: "up" | "down" | "left" | "right") => void;
  highlightHome: () => void;
  highlightEnd: () => void;
  highlightPage: (direction: -1 | 1) => void;
  /** Enter or Space — open highlighted task in the editor (keyboard bridge). */
  openHighlightedTask: () => void;
  /** F2 — rename the highlighted list, or start inline title-only edit for the highlighted task. */
  editHighlightedTaskTitle: () => void;
  /** Delete — delete highlighted task or list (board-level confirm; same as list ⋮ Delete for lists). */
  requestDeleteHighlight: () => void;
  /** T — open add-task composer for the highlighted task’s list or selected list. */
  addTaskAtHighlight: () => void;
  /** L — open the inline add-list composer after the highlighted list (task or list header). */
  addListAfterHighlight: (board: Board) => void;
  /** C — complete highlighted task if not already closed. */
  completeHighlightedTask: (board: Board) => void;
  /** N — show/hide board task statistics (T / O / C chips). */
  toggleBoardStats: (board: Board) => void;
  /** R — reopen highlighted task to canonical open if closed. */
  reopenHighlightedTask: (board: Board) => void;
  /** E — set highlighted task release to the board default (overwrite). */
  assignDefaultReleaseToHighlightedTask: (board: Board) => void;
}

/** Help dialog tab — must match {@link BoardShortcutDefinition.helpTab} on each registry entry. */
export type ShortcutHelpTabId =
  | "general"
  | "tasks"
  | "lists"
  | "boards"
  | "navigation";

export const SHORTCUT_HELP_TABS: {
  id: ShortcutHelpTabId;
  label: string;
  description: string;
}[] = [
  {
    id: "navigation",
    label: "Navigation",
    description:
      "Search, filters panel, moving the highlight, and scrolling the board view.",
  },
  {
    id: "general",
    label: "General",
    description: "Help and board-wide display options.",
  },
  {
    id: "tasks",
    label: "Tasks",
    description: "Shortcuts that act on the highlighted task.",
  },
  {
    id: "lists",
    label: "Lists",
    description: "Move between lists on the board.",
  },
  {
    id: "boards",
    label: "Boards",
    description: "Filters and grouping for what appears on this board.",
  },
];

export interface BoardShortcutDefinition {
  id: string;
  scope: ShortcutScope;
  /** Display labels, e.g. "H" */
  keys: string[];
  description: string;
  /** Which tab shows this row in the shortcut help dialog (keeps help aligned with the registry). */
  helpTab: ShortcutHelpTabId;
  /** Short note on when the shortcut applies (e.g. task highlighted vs board focus only). */
  helpContext?: string;
  /** Sort order within the help tab (lower first). Omit to use registry order for that tab. */
  helpOrder?: number;
  /**
   * When true, this row appears in the shortcuts dialog only; {@link useBoardShortcutKeydown}
   * does not dispatch it (use for duplicate keys explained in another tab).
   */
  helpOnly?: boolean;
  preventDefault?: boolean;
  /** Key from KeyboardEvent.key, lowercased for letters */
  matchKey: (key: string) => boolean;
  enabled?: (board: Board | null) => boolean;
  run: (board: Board, actions: BoardShortcutActions) => void;
}
