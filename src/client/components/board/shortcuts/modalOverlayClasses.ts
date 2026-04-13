/**
 * Board canvas sets `cursor-grab`; modals are DOM descendants, so they inherit it unless reset.
 * Use on the fixed full-screen backdrop wrapper for task/editor/search dialogs on the board.
 */
export const MODAL_BACKDROP_SURFACE_CLASS = "cursor-default";

/**
 * Scrollable dialog panels: avoid scroll chaining into the board when at scroll extents.
 */
export const MODAL_DIALOG_OVERSCROLL_CLASS = "overscroll-y-contain";

/**
 * Inputs/editors inside modals should show the text cursor, not the parent grab cursor.
 */
export const MODAL_TEXT_FIELD_CURSOR_CLASS =
  "[&_input]:cursor-text [&_textarea]:cursor-text";
