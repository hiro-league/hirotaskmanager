import { coerceTaskStatus } from "../../shared/models";
import type { Board } from "../../shared/models";
import { getDb, withTransaction } from "../db";
import { boardExists, statusIsClosed } from "./helpers";
import { loadBoard } from "./board";

export function createTaskOnBoard(
  boardId: number,
  input: {
    listId: number;
    status: string;
    title: string;
    body: string;
    groupId: number;
    priorityId?: number | null;
    emoji?: string | null;
  },
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;

  const listRow = db
    .query("SELECT id FROM list WHERE id = ? AND board_id = ?")
    .get(input.listId, boardId) as { id: number } | null;
  if (!listRow) return null;

  const gRow = db
    .query("SELECT id FROM task_group WHERE id = ? AND board_id = ?")
    .get(input.groupId, boardId) as { id: number } | null;
  if (!gRow) return null;

  const priorityId = input.priorityId ?? null;
  if (priorityId !== null) {
    const pRow = db
      .query("SELECT id FROM task_priority WHERE id = ? AND board_id = ?")
      .get(priorityId, boardId) as { id: number } | null;
    if (!pRow) return null;
  }

  const allowedStatusIds = (
    db.query("SELECT id FROM status ORDER BY sort_order ASC, id ASC").all() as {
      id: string;
    }[]
  ).map((r) => r.id);
  const statusId = coerceTaskStatus(input.status, allowedStatusIds);

  const bandRows = db
    .query(
      `SELECT sort_order FROM task WHERE board_id = ? AND list_id = ? AND status_id = ?`,
    )
    .all(boardId, input.listId, statusId) as { sort_order: number }[];
  const maxOrder = bandRows.reduce(
    (m, r) => Math.max(m, r.sort_order),
    -1,
  );

  const now = new Date().toISOString();
  const closedAt = statusIsClosed(db, statusId) ? now : null;
  const emoji = input.emoji ?? null;
  withTransaction(db, () => {
    db.run(
      `INSERT INTO task (list_id, group_id, priority_id, board_id, status_id,
         title, body, sort_order, color, emoji, created_at, updated_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.listId,
        input.groupId,
        priorityId,
        boardId,
        statusId,
        input.title,
        input.body,
        maxOrder + 1,
        null,
        emoji,
        now,
        now,
        closedAt,
      ],
    );
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}

export function patchTaskOnBoard(
  boardId: number,
  taskId: number,
  patch: Partial<{
    title: string;
    body: string;
    listId: number;
    groupId: number;
    priorityId: number | null;
    status: string;
    order: number;
    color: string | null;
    emoji: string | null;
  }>,
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;

  const trow = db
    .query(
      `SELECT id, list_id, group_id, priority_id, status_id, title, body, sort_order, color, emoji, created_at, updated_at, closed_at
       FROM task WHERE id = ? AND board_id = ?`,
    )
    .get(taskId, boardId) as {
    id: number;
    list_id: number;
    group_id: number;
    priority_id: number | null;
    status_id: string;
    title: string;
    body: string;
    sort_order: number;
    color: string | null;
    emoji: string | null;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
  } | null;
  if (!trow) return null;

  let listId = patch.listId ?? trow.list_id;
  let groupId = patch.groupId ?? trow.group_id;
  const priorityId =
    patch.priorityId !== undefined ? patch.priorityId : trow.priority_id;
  const allowedStatusIds = (
    db.query("SELECT id FROM status ORDER BY sort_order ASC, id ASC").all() as {
      id: string;
    }[]
  ).map((r) => r.id);
  let statusId =
    patch.status !== undefined
      ? coerceTaskStatus(patch.status, allowedStatusIds)
      : trow.status_id;

  const listOk = db
    .query("SELECT id FROM list WHERE id = ? AND board_id = ?")
    .get(listId, boardId) as { id: number } | null;
  if (!listOk) return null;

  const gOk = db
    .query("SELECT id FROM task_group WHERE id = ? AND board_id = ?")
    .get(groupId, boardId) as { id: number } | null;
  if (!gOk) return null;

  if (priorityId !== null) {
    // Nullable priorities are valid, but any non-null id must still belong to this board.
    const pOk = db
      .query("SELECT id FROM task_priority WHERE id = ? AND board_id = ?")
      .get(priorityId, boardId) as { id: number } | null;
    if (!pOk) return null;
  }

  const statusChanged = trow.status_id !== statusId;
  const listChanged = trow.list_id !== listId;
  let order: number;
  if (statusChanged || listChanged) {
    const others = db
      .query(
        `SELECT sort_order FROM task WHERE board_id = ? AND list_id = ? AND status_id = ? AND id != ?`,
      )
      .all(boardId, listId, statusId, taskId) as { sort_order: number }[];
    order = others.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;
  } else {
    order = patch.order ?? trow.sort_order;
  }

  const title = patch.title ?? trow.title;
  const body = patch.body ?? trow.body;
  const color = patch.color !== undefined ? patch.color : trow.color;
  const emoji =
    patch.emoji !== undefined
      ? patch.emoji
      : trow.emoji != null && String(trow.emoji).trim() !== ""
        ? String(trow.emoji).trim()
        : null;
  const now = new Date().toISOString();

  let nextClosedAt: string | null;
  if (statusIsClosed(db, statusId)) {
    nextClosedAt = trow.closed_at ?? now;
  } else {
    nextClosedAt = null;
  }

  withTransaction(db, () => {
    db.run(
      `UPDATE task SET list_id = ?, group_id = ?, priority_id = ?, status_id = ?, title = ?, body = ?,
         sort_order = ?, color = ?, emoji = ?, updated_at = ?, closed_at = ? WHERE id = ?`,
      [
        listId,
        groupId,
        priorityId,
        statusId,
        title,
        body,
        order,
        color,
        emoji,
        now,
        nextClosedAt,
        taskId,
      ],
    );
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}

export function deleteTaskOnBoard(
  boardId: number,
  taskId: number,
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const row = db
    .query("SELECT id FROM task WHERE id = ? AND board_id = ?")
    .get(taskId, boardId) as { id: number } | null;
  if (!row) return null;
  const now = new Date().toISOString();
  withTransaction(db, () => {
    db.run("DELETE FROM task WHERE id = ?", [taskId]);
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}

export function reorderTasksInBand(
  boardId: number,
  listId: number,
  status: string,
  orderedTaskIds: number[],
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;

  const allowedStatusIds = (
    db.query("SELECT id FROM status ORDER BY sort_order ASC, id ASC").all() as {
      id: string;
    }[]
  ).map((r) => r.id);
  const statusId = coerceTaskStatus(status, allowedStatusIds);

  const band = db
    .query(
      `SELECT id FROM task WHERE board_id = ? AND list_id = ? AND status_id = ? ORDER BY sort_order, id`,
    )
    .all(boardId, listId, statusId) as { id: number }[];

  if (band.length !== orderedTaskIds.length) return null;
  const idSet = new Set(band.map((b) => b.id));
  for (const id of orderedTaskIds) {
    if (!idSet.has(id)) return null;
  }

  const now = new Date().toISOString();
  withTransaction(db, () => {
    orderedTaskIds.forEach((tid, i) => {
      db.run(
        "UPDATE task SET sort_order = ?, updated_at = ? WHERE id = ? AND board_id = ?",
        [i, now, tid, boardId],
      );
    });
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return loadBoard(boardId);
}
