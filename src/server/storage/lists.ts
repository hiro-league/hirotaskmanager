import type { Board, List } from "../../shared/models";
import type { RowProvenance } from "../provenance";
import { getDb, withTransaction } from "../db";
import { boardExists } from "./helpers";
import { loadBoard } from "./board";

export type ListWriteResult = {
  boardId: number;
  boardUpdatedAt: string;
  list: List;
};

export type ListDeleteResult = {
  boardId: number;
  boardUpdatedAt: string;
  deletedListId: number;
};

type ListRow = {
  id: number;
  name: string;
  sort_order: number;
  color: string | null;
  emoji: string | null;
  created_by_principal?: string | null;
  created_by_label?: string | null;
};

function normalizePrincipal(
  raw: string | null | undefined,
): import("../../shared/provenance").CreatorPrincipalType | undefined {
  if (raw === "web" || raw === "cli" || raw === "system") return raw;
  return undefined;
}

function mapListRow(row: ListRow): List {
  return {
    id: row.id,
    name: row.name,
    order: row.sort_order,
    color: row.color ?? undefined,
    emoji:
      row.emoji != null && String(row.emoji).trim() !== ""
        ? String(row.emoji).trim()
        : null,
    createdByPrincipal: normalizePrincipal(row.created_by_principal) ?? "web",
    createdByLabel: row.created_by_label,
  };
}

function readBoardUpdatedAt(boardId: number): string | null {
  const db = getDb();
  const row = db
    .query("SELECT updated_at FROM board WHERE id = ?")
    .get(boardId) as { updated_at: string } | null;
  return row?.updated_at ?? null;
}

/** Phase 2: small list writes read back one list row instead of reloading the full board. */
export function readListById(boardId: number, listId: number): List | null {
  const db = getDb();
  const row = db
    .query(
      "SELECT id, name, sort_order, color, emoji, created_by_principal, created_by_label FROM list WHERE id = ? AND board_id = ?",
    )
    .get(listId, boardId) as ListRow | null;
  return row ? mapListRow(row) : null;
}

export function createListOnBoard(
  boardId: number,
  input: { name: string; emoji?: string | null },
  provenance?: RowProvenance,
): ListWriteResult | null {
  const trimmed = input.name.trim() || "New list";
  const emoji = input.emoji ?? null;
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const now = new Date().toISOString();
  const principal = provenance?.principal ?? "web";
  const label = provenance?.label ?? null;
  let listId: number | null = null;
  withTransaction(db, () => {
    const maxRow = db
      .query(
        "SELECT COALESCE(MAX(sort_order), -1) AS m FROM list WHERE board_id = ?",
      )
      .get(boardId) as { m: number };
    const nextOrder = maxRow.m + 1;
    const result = db.run(
      "INSERT INTO list (board_id, name, sort_order, color, emoji, created_by_principal, created_by_label) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [boardId, trimmed, nextOrder, null, emoji, principal, label],
    );
    listId = Number(result.lastInsertRowid);
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  if (listId == null) return null;
  const list = readListById(boardId, listId);
  if (!list) return null;
  return { boardId, boardUpdatedAt: now, list };
}

export function patchListOnBoard(
  boardId: number,
  listId: number,
  updates: { name?: string; color?: string | null; emoji?: string | null },
): ListWriteResult | null {
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
  if (updates.emoji !== undefined) {
    sets.push("emoji = ?");
    vals.push(updates.emoji);
  }
  if (sets.length === 0) {
    const list = readListById(boardId, listId);
    if (!list) return null;
    const boardUpdatedAt = readBoardUpdatedAt(boardId);
    if (!boardUpdatedAt) return null;
    return { boardId, boardUpdatedAt, list };
  }

  const now = new Date().toISOString();
  vals.push(listId, boardId);
  withTransaction(db, () => {
    db.run(
      `UPDATE list SET ${sets.join(", ")} WHERE id = ? AND board_id = ?`,
      vals as Parameters<typeof db.run>[1],
    );
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  const list = readListById(boardId, listId);
  if (!list) return null;
  return { boardId, boardUpdatedAt: now, list };
}

export function deleteListOnBoard(
  boardId: number,
  listId: number,
): ListDeleteResult | null {
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
  return { boardId, boardUpdatedAt: now, deletedListId: listId };
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

export function moveListOnBoard(
  boardId: number,
  input: {
    listId: number;
    beforeListId?: number;
    afterListId?: number;
    position?: "first" | "last";
  },
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;

  const currentOrder = db
    .query(
      "SELECT id FROM list WHERE board_id = ? ORDER BY sort_order ASC, id ASC",
    )
    .all(boardId) as { id: number }[];
  const orderedIds = currentOrder.map((row) => row.id);
  if (!orderedIds.includes(input.listId)) return null;

  const placementCount =
    (input.beforeListId != null ? 1 : 0) +
    (input.afterListId != null ? 1 : 0) +
    (input.position != null ? 1 : 0);
  if (placementCount > 1) return null;

  const remaining = orderedIds.filter((id) => id !== input.listId);
  let insertAt = remaining.length;

  if (input.beforeListId != null) {
    if (input.beforeListId === input.listId) return null;
    const idx = remaining.indexOf(input.beforeListId);
    if (idx < 0) return null;
    insertAt = idx;
  } else if (input.afterListId != null) {
    if (input.afterListId === input.listId) return null;
    const idx = remaining.indexOf(input.afterListId);
    if (idx < 0) return null;
    insertAt = idx + 1;
  } else if (input.position === "first") {
    insertAt = 0;
  } else if (input.position === "last" || input.position == null) {
    insertAt = remaining.length;
  } else {
    return null;
  }

  const nextOrder = [
    ...remaining.slice(0, insertAt),
    input.listId,
    ...remaining.slice(insertAt),
  ];
  const now = new Date().toISOString();
  withTransaction(db, () => {
    nextOrder.forEach((listId, order) => {
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
