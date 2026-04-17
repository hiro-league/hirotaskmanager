export type CelebrateTaskCompletionOptions = {
  /** Prefer the “Mark complete” button (`data-task-complete-button`) for this task. */
  taskId?: number;
  /** Emit from this element (e.g. click target or task editor dialog). Overrides `taskId` when set. */
  anchorEl?: HTMLElement | null;
};
