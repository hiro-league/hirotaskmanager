/** Dispatched from the app header; {@link BoardView} opens the dialog when a board route is active. */
export const OPEN_SHORTCUT_HELP_EVENT = "taskmanager:open-shortcut-help";

export function dispatchOpenShortcutHelp(): void {
  window.dispatchEvent(new CustomEvent(OPEN_SHORTCUT_HELP_EVENT));
}
