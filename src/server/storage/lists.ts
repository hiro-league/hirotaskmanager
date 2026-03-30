import type { Board } from "../../shared/models";
import { getDb, withTransaction } from "../db";
import { boardExists } from "./helpers";
import { loadBoard } from "./board";

export function createListOnBoard(boardId: number, name: string): Board | null {
  const trimmed = name.trim() || "New list";
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const now = new Date().toISOString();
  withTransaction(db, () => {
    const maxRow = db
      .query(
        "SELECT COALESCE(MAX(sort_order), -1) AS m FROM list WHERE board_id = ?",
      )
      .get(boardId) as { m: number };
    const nextOrder = maxRow.m + 1;
    db.run(
      "INSERT INTO list (board_id, name, sort_order, color) VALUES (?, ?, ?, ?)",
      [boardId, trimmed, nextOrder, null],
    );
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}

export function patchListOnBoard(
  boardId: number,
  listId: number,
  updates: { name?: string; color?: string | null },
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const row = db
    .query("SELECT id FROM list WHERE id = ? AND board_id = ?")
    .get(listId, boardId) as { id: number } | null;
  if (!row) return null;

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (updates.name !== undefined) {
    sets.push("name = ?");
    vals.push(updates.name.trim());
  }
  if (updates.color !== undefined) {
    sets.push("color = ?");
    vals.push(updates.color);
  }
  if (sets.length === 0) return loadBoard(boardId);

  const now = new Date().toISOString();
  vals.push(listId, boardId);
  withTransaction(db, () => {
    db.run(
      `UPDATE list SET ${sets.join(", ")} WHERE id = ? AND board_id = ?`,
      vals as Parameters<typeof db.run>[1],
    );
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}

export function deleteListOnBoard(boardId: number, listId: number): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const row = db
    .query("SELECT id FROM list WHERE id = ? AND board_id = ?")
    .get(listId, boardId) as { id: number } | null;
  if (!row) return null;
  const now = new Date().toISOString();
  withTransaction(db, () => {
    db.run("DELETE FROM list WHERE id = ?", [listId]);
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}

export function reorderListsOnBoard(
  boardId: number,
  orderedListIds: number[],
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const rows = db
    .query("SELECT id FROM list WHERE board_id = ?")
    .all(boardId) as { id: number }[];
  const ids = new Set(rows.map((r) => r.id));
  if (orderedListIds.length !== ids.size) return null;
  for (const id of orderedListIds) {
    if (!ids.has(id)) return null;
  }
  const now = new Date().toISOString();
  withTransaction(db, () => {
    orderedListIds.forEach((listId, order) => {
      db.run("UPDATE list SET sort_order = ? WHERE id = ? AND board_id = ?", [
        order,
        listId,
        boardId,
      ]);
    });
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}
