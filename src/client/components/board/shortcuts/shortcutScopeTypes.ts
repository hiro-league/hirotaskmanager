/**
 * Keyboard shortcut scopes for board-related UI (Phase 4).
 * Topmost scope on the stack wins; empty stack means `board`.
 */
export type ShortcutScope =
  | "board"
  | "shortcut-help-dialog"
  | "board-search-dialog"
  | "task-editor"
  | "task-groups-editor"
  | "task-priorities-editor"
  | "discard-dialog"
  | "task-delete-confirmation"
  | "list-delete-confirmation"
  | "list-header-menu";
