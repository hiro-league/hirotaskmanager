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
  | "board-edit-dialog"
  | "task-priorities-editor"
  | "releases-editor"
  | "discard-dialog"
  | "list-header-menu";
