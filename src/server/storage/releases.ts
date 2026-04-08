import type { Database } from "bun:sqlite";
import type { ReleaseDefinition } from "../../shared/models";
import { getDb, withTransaction } from "../db";
import { boardExists } from "./helpers";

function mapReleaseRow(r: {
  id: number;
  board_id: number;
  name: string;
  color: string | null;
  release_date: string | null;
  created_at: string;
}): ReleaseDefinition {
  return {
    id: r.id,
    name: r.name,
    color:
      r.color != null && String(r.color).trim() !== ""
        ? String(r.color).trim()
        : null,
    releaseDate:
      r.release_date != null && String(r.release_date).trim() !== ""
        ? String(r.release_date).trim()
        : null,
    createdAt: r.created_at,
  };
}

export function listReleasesForBoard(boardId: number): ReleaseDefinition[] {
  const db = getDb();
  const rows = db
    .query(
      `SELECT id, board_id, name, color, release_date, created_at
       FROM board_release WHERE board_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(boardId) as {
    id: number;
    board_id: number;
    name: string;
    color: string | null;
    release_date: string | null;
    created_at: string;
  }[];
  return rows.map(mapReleaseRow);
}

export type CreateBoardReleaseInput = {
  name: string;
  color?: string | null;
  releaseDate?: string | null;
};

export function createBoardRelease(
  boardId: number,
  input: CreateBoardReleaseInput,
): ReleaseDefinition | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const name = input.name.trim();
  if (!name) return null;
  const now = new Date().toISOString();
  const color =
    input.color !== undefined && input.color !== null && String(input.color).trim() !== ""
      ? String(input.color).trim()
      : null;
  const releaseDate =
    input.releaseDate !== undefined &&
    input.releaseDate !== null &&
    String(input.releaseDate).trim() !== ""
      ? String(input.releaseDate).trim()
      : null;
  let id: number | null = null;
  try {
    withTransaction(db, () => {
      const r = db.run(
        `INSERT INTO board_release (board_id, name, color, release_date, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [boardId, name, color, releaseDate, now],
      );
      id = Number(r.lastInsertRowid);
      db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
    });
  } catch {
    return null;
  }
  if (id == null) return null;
  const row = db
    .query(
      "SELECT id, board_id, name, color, release_date, created_at FROM board_release WHERE id = ?",
    )
    .get(id) as Parameters<typeof mapReleaseRow>[0] | null;
  return row ? mapReleaseRow(row) : null;
}

export type UpdateBoardReleaseInput = {
  name?: string;
  color?: string | null;
  releaseDate?: string | null;
};

export function updateBoardRelease(
  boardId: number,
  releaseId: number,
  input: UpdateBoardReleaseInput,
): ReleaseDefinition | null {
  const db = getDb();
  const row = db
    .query(
      "SELECT id, board_id, name, color, release_date, created_at FROM board_release WHERE id = ? AND board_id = ?",
    )
    .get(releaseId, boardId) as Parameters<typeof mapReleaseRow>[0] | null;
  if (!row) return null;

  const nextName =
    input.name !== undefined ? input.name.trim() : row.name;
  if (!nextName) return null;

  let nextColor: string | null;
  if (input.color !== undefined) {
    nextColor =
      input.color != null && String(input.color).trim() !== ""
        ? String(input.color).trim()
        : null;
  } else {
    nextColor = row.color;
  }

  let nextDate: string | null;
  if (input.releaseDate !== undefined) {
    nextDate =
      input.releaseDate != null && String(input.releaseDate).trim() !== ""
        ? String(input.releaseDate).trim()
        : null;
  } else {
    nextDate = row.release_date;
  }

  const now = new Date().toISOString();
  try {
    withTransaction(db, () => {
      db.run(
        `UPDATE board_release SET name = ?, color = ?, release_date = ? WHERE id = ? AND board_id = ?`,
        [nextName, nextColor, nextDate, releaseId, boardId],
      );
      db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
    });
  } catch {
    // Unique `(board_id, name)` — duplicate rename returns null for API 400.
    return null;
  }
  const out = db
    .query(
      "SELECT id, board_id, name, color, release_date, created_at FROM board_release WHERE id = ?",
    )
    .get(releaseId) as Parameters<typeof mapReleaseRow>[0] | null;
  return out ? mapReleaseRow(out) : null;
}

export type DeleteBoardReleaseOptions = {
  /** When set, tasks on the deleted release move to this release; when omitted, tasks become untagged. */
  moveTasksToReleaseId?: number;
};

/**
 * Deletes a release. Clears `board.default_release_id` / auto-assign when it pointed at this row.
 * Unique name constraint applies per board — callers surface errors.
 */
export function deleteBoardRelease(
  boardId: number,
  releaseId: number,
  options: DeleteBoardReleaseOptions = {},
): boolean {
  const db = getDb();
  if (!boardExists(db, boardId)) return false;
  const exists = db
    .query("SELECT id FROM board_release WHERE id = ? AND board_id = ?")
    .get(releaseId, boardId) as { id: number } | null;
  if (!exists) return false;

  const moveTo = options.moveTasksToReleaseId;
  if (moveTo !== undefined) {
    if (moveTo === releaseId) return false;
    const target = db
      .query("SELECT id FROM board_release WHERE id = ? AND board_id = ?")
      .get(moveTo, boardId) as { id: number } | null;
    if (!target) return false;
  }

  const now = new Date().toISOString();
  withTransaction(db, () => {
    db.run(
      "UPDATE board SET default_release_id = NULL, auto_assign_release_ui = 0, auto_assign_release_cli = 0, updated_at = ? WHERE id = ? AND default_release_id = ?",
      [now, boardId, releaseId],
    );
    if (moveTo !== undefined) {
      db.run(
        "UPDATE task SET release_id = ?, updated_at = ? WHERE board_id = ? AND release_id = ?",
        [moveTo, now, boardId, releaseId],
      );
    } else {
      db.run(
        "UPDATE task SET release_id = NULL, updated_at = ? WHERE board_id = ? AND release_id = ?",
        [now, boardId, releaseId],
      );
    }
    db.run("DELETE FROM board_release WHERE id = ? AND board_id = ?", [
      releaseId,
      boardId,
    ]);
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return true;
}

/** Returns whether `releaseId` belongs to `boardId`. */
export function releaseBelongsToBoard(
  db: Database,
  boardId: number,
  releaseId: number,
): boolean {
  const row = db
    .query("SELECT id FROM board_release WHERE id = ? AND board_id = ?")
    .get(releaseId, boardId) as { id: number } | null;
  return row != null;
}
