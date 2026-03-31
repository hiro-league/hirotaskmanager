import type { Board } from "../../../../shared/models";
import type { ShortcutScope } from "./shortcutScopeTypes";

export type { ShortcutScope };

/** Actions wired in BoardView; registry runs use this instead of importing the store directly. */
export interface BoardShortcutActions {
  openHelp: () => void;
  toggleFilters: () => void;
  /** Cycle All → group1 → group2 → … → All. No-op if there are no groups. */
  cycleTaskGroup: (board: Board) => void;
  allTaskGroups: (board: Board) => void;
  /** F — focus first task or scroll current highlight into view. */
  focusOrScrollHighlight: () => void;
  moveHighlight: (dir: "up" | "down" | "left" | "right") => void;
  highlightHome: () => void;
  highlightEnd: () => void;
  highlightPage: (direction: -1 | 1) => void;
  /** Enter — open highlighted task in the editor (keyboard bridge). */
  openHighlightedTask: () => void;
  /** D — ask to delete highlighted task (board-level confirm). */
  requestDeleteHighlightedTask: () => void;
  /** C — complete highlighted task if not already closed. */
  completeHighlightedTask: (board: Board) => void;
  /** R — reopen highlighted task to canonical open if closed. */
  reopenHighlightedTask: (board: Board) => void;
}

export interface BoardShortcutDefinition {
  id: string;
  scope: ShortcutScope;
  /** Display labels, e.g. "H" */
  keys: string[];
  description: string;
  preventDefault?: boolean;
  /** Key from KeyboardEvent.key, lowercased for letters */
  matchKey: (key: string) => boolean;
  enabled?: (board: Board | null) => boolean;
  run: (board: Board, actions: BoardShortcutActions) => void;
}
