/** Persisted hint for `/` → which board to open first. */
export const LAST_BOARD_STORAGE_KEY = "taskmanager:lastBoardId";

export function boardPath(boardId: string | number): string {
  return `/board/${encodeURIComponent(String(boardId))}`;
}

/** Current board id when the URL is `/board/:id` (SPA). */
export function parseBoardIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/board\/([^/]+)\/?$/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}
