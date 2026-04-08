/**
 * Board API payload tuning (see `docs/board-performance-plan.md` Phase 2 #7).
 * Default max UTF-16 code units per task `body` for `GET /api/boards/:id?slim=1`.
 * Slightly above the largest TaskCard preview window (140) so collapsed whitespace
 * still yields a full on-card preview after `previewBody()` on the client.
 */
export const BOARD_FETCH_SLIM_TASK_BODY_CHARS = 256;

/** Hard cap for explicit `bodyPreview=` on the same endpoint (avoid huge allocations). */
export const BOARD_FETCH_MAX_TASK_BODY_PREVIEW_CHARS = 8192;
