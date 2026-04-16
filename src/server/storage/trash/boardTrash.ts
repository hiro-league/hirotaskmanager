import type { RestoreOutcome } from "../../../shared/trashApi";
import { getDb } from "../../db";

/** Move board to Trash (normal delete). */
export function trashBoardById(
  boardId: number,
): { boardId: number; boardUpdatedAt: string } | null {
  const db = getDb();
  const row = db
    .query("SELECT id FROM board WHERE id = ? AND deleted_at IS NULL")
    .get(boardId) as { id: number } | null;
  if (!row) return null;
  const now = new Date().toISOString();
  db.run("UPDATE board SET deleted_at = ?, updated_at = ? WHERE id = ?", [
    now,
    now,
    boardId,
  ]);
  return { boardId, boardUpdatedAt: now };
}

export function restoreBoardById(
  boardId: number,
): RestoreOutcome<{ boardId: number; boardUpdatedAt: string }> {
  const db = getDb();
  const row = db
    .query("SELECT id FROM board WHERE id = ? AND deleted_at IS NOT NULL")
    .get(boardId) as { id: number } | null;
  if (!row) return { ok: false, reason: "not_found" };
  const now = new Date().toISOString();
  db.run("UPDATE board SET deleted_at = NULL, updated_at = ? WHERE id = ?", [
    now,
    boardId,
  ]);
  return { ok: true, value: { boardId, boardUpdatedAt: now } };
}

/** Hard-delete board (Trash purge only). Row must be explicitly trashed. */
export async function purgeBoardById(boardId: number): Promise<boolean> {
  const db = getDb();
  const result = db.run(
    "DELETE FROM board WHERE id = ? AND deleted_at IS NOT NULL",
    [boardId],
  );
  return result.changes > 0;
}
