import { coerceTaskStatus } from "../../shared/models";
import type { Board, Task } from "../../shared/models";
import type { CreatorPrincipalType } from "../../shared/provenance";
import type { RowProvenance } from "../provenance";
import { getDb, withTransaction } from "../db";
import { boardExists, statusIsClosed } from "./helpers";
import { loadBoard } from "./board";

type TaskRow = {
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
  created_by_principal?: string | null;
  created_by_label?: string | null;
};

function normalizeTaskPrincipal(
  raw: string | null | undefined,
): CreatorPrincipalType | undefined {
  if (raw === "web" || raw === "cli" || raw === "system") return raw;
  return undefined;
}

export type TaskWriteResult = {
  boardId: number;
  boardUpdatedAt: string;
  task: Task;
};

export type TaskDeleteResult = {
  boardId: number;
  boardUpdatedAt: string;
  deletedTaskId: number;
};

function mapTaskRow(t: TaskRow): Task {
  return {
    id: t.id,
    listId: t.list_id,
    title: t.title,
    body: t.body,
    groupId: t.group_id,
    priorityId: t.priority_id,
    status: t.status_id as Task["status"],
    order: t.sort_order,
    color: t.color ?? undefined,
    emoji:
      t.emoji != null && String(t.emoji).trim() !== ""
        ? String(t.emoji).trim()
        : null,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    closedAt: t.closed_at ?? undefined,
    createdByPrincipal: normalizeTaskPrincipal(t.created_by_principal) ?? "web",
    createdByLabel: t.created_by_label,
  };
}

/** Phase 2: small task writes read back one task row instead of reloading the full board. */
export function readTaskById(boardId: number, taskId: number): Task | null {
  const db = getDb();
  const row = db
    .query(
      `SELECT id, list_id, group_id, priority_id, status_id, title, body, sort_order, color, emoji,
              created_at, updated_at, closed_at, created_by_principal, created_by_label
       FROM task WHERE id = ? AND board_id = ?`,
    )
    .get(taskId, boardId) as TaskRow | null;
  return row ? mapTaskRow(row) : null;
}

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
  provenance?: RowProvenance,
): TaskWriteResult | null {
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
  const principal = provenance?.principal ?? "web";
  const label = provenance?.label ?? null;
  let taskId: number | null = null;
  withTransaction(db, () => {
    const result = db.run(
      `INSERT INTO task (list_id, group_id, priority_id, board_id, status_id,
         title, body, sort_order, color, emoji, created_at, updated_at, closed_at,
         created_by_principal, created_by_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        principal,
        label,
      ],
    );
    taskId = Number(result.lastInsertRowid);
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  if (taskId == null) return null;
  const task = readTaskById(boardId, taskId);
  if (!task) return null;
  return { boardId, boardUpdatedAt: now, task };
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
): TaskWriteResult | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;

  const trow = db
    .query(
      `SELECT id, list_id, group_id, priority_id, status_id, title, body, sort_order, color, emoji, created_at, updated_at, closed_at
       FROM task WHERE id = ? AND board_id = ?`,
    )
    .get(taskId, boardId) as TaskRow | null;
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
  const task = readTaskById(boardId, taskId);
  if (!task) return null;
  return { boardId, boardUpdatedAt: now, task };
}

export function deleteTaskOnBoard(
  boardId: number,
  taskId: number,
): TaskDeleteResult | null {
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
  return { boardId, boardUpdatedAt: now, deletedTaskId: taskId };
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

function mergeVisibleOrderIntoBand(
  serverBand: number[],
  visibleOrderedTaskIds: number[],
): number[] | null {
  const visibleSet = new Set(visibleOrderedTaskIds);
  if (visibleSet.size !== visibleOrderedTaskIds.length) return null;
  if (!visibleOrderedTaskIds.every((id) => serverBand.includes(id))) return null;
  if (visibleOrderedTaskIds.length === serverBand.length) return visibleOrderedTaskIds;

  const out: number[] = [];
  let visibleIdx = 0;
  for (const id of serverBand) {
    if (visibleSet.has(id)) {
      const nextId = visibleOrderedTaskIds[visibleIdx++];
      if (nextId == null) return null;
      out.push(nextId);
    } else {
      out.push(id);
    }
  }
  return out;
}

export function moveTaskOnBoard(
  boardId: number,
  input: {
    taskId: number;
    toListId?: number;
    toStatus?: string;
    beforeTaskId?: number;
    afterTaskId?: number;
    position?: "first" | "last";
    visibleOrderedTaskIds?: number[];
  },
): Board | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;

  const taskRow = db
    .query(
      `SELECT id, list_id, group_id, priority_id, status_id, title, body, sort_order, color, emoji, created_at, updated_at, closed_at
       FROM task WHERE id = ? AND board_id = ?`,
    )
    .get(input.taskId, boardId) as TaskRow | null;
  if (!taskRow) return null;

  const placementCount =
    (input.beforeTaskId != null ? 1 : 0) +
    (input.afterTaskId != null ? 1 : 0) +
    (input.position != null ? 1 : 0);
  if (placementCount > 1) return null;

  const toListId = input.toListId ?? taskRow.list_id;
  const listOk = db
    .query("SELECT id FROM list WHERE id = ? AND board_id = ?")
    .get(toListId, boardId) as { id: number } | null;
  if (!listOk) return null;

  const allowedStatusIds = (
    db.query("SELECT id FROM status ORDER BY sort_order ASC, id ASC").all() as {
      id: string;
    }[]
  ).map((r) => r.id);
  const toStatus = coerceTaskStatus(input.toStatus ?? taskRow.status_id, allowedStatusIds);

  const sourceListId = taskRow.list_id;
  const sourceStatus = taskRow.status_id;
  const sameBand = sourceListId === toListId && sourceStatus === toStatus;

  const sourceBandIds = (
    db.query(
      `SELECT id FROM task WHERE board_id = ? AND list_id = ? AND status_id = ? ORDER BY sort_order ASC, id ASC`,
    ).all(boardId, sourceListId, sourceStatus) as { id: number }[]
  ).map((row) => row.id);

  const destinationBandWithoutTask = (
    db.query(
      `SELECT id FROM task WHERE board_id = ? AND list_id = ? AND status_id = ? AND id != ? ORDER BY sort_order ASC, id ASC`,
    ).all(boardId, toListId, toStatus, input.taskId) as { id: number }[]
  ).map((row) => row.id);

  if (input.beforeTaskId != null) {
    if (input.beforeTaskId === input.taskId) return null;
    const target = db
      .query("SELECT list_id, status_id FROM task WHERE id = ? AND board_id = ?")
      .get(input.beforeTaskId, boardId) as {
      list_id: number;
      status_id: string;
    } | null;
    if (!target || target.list_id !== toListId || target.status_id !== toStatus) return null;
  }
  if (input.afterTaskId != null) {
    if (input.afterTaskId === input.taskId) return null;
    const target = db
      .query("SELECT list_id, status_id FROM task WHERE id = ? AND board_id = ?")
      .get(input.afterTaskId, boardId) as {
      list_id: number;
      status_id: string;
    } | null;
    if (!target || target.list_id !== toListId || target.status_id !== toStatus) return null;
  }

  let destinationOrder: number[];
  if (Array.isArray(input.visibleOrderedTaskIds) && input.visibleOrderedTaskIds.length > 0) {
    const baseline = sameBand
      ? sourceBandIds
      : [...destinationBandWithoutTask, input.taskId];
    const merged = mergeVisibleOrderIntoBand(baseline, input.visibleOrderedTaskIds);
    if (!merged || !merged.includes(input.taskId)) return null;
    destinationOrder = merged;
  } else {
    const remaining = destinationBandWithoutTask;
    let insertAt = remaining.length;

    if (input.beforeTaskId != null) {
      const idx = remaining.indexOf(input.beforeTaskId);
      if (idx < 0) return null;
      insertAt = idx;
    } else if (input.afterTaskId != null) {
      const idx = remaining.indexOf(input.afterTaskId);
      if (idx < 0) return null;
      insertAt = idx + 1;
    } else if (input.position === "first") {
      insertAt = 0;
    } else if (input.position === "last" || input.position == null) {
      insertAt = remaining.length;
    } else {
      return null;
    }

    destinationOrder = [
      ...remaining.slice(0, insertAt),
      input.taskId,
      ...remaining.slice(insertAt),
    ];
  }

  const nextClosedAt = statusIsClosed(db, toStatus)
    ? taskRow.closed_at ?? new Date().toISOString()
    : null;
  const now = new Date().toISOString();

  withTransaction(db, () => {
    if (sameBand) {
      destinationOrder.forEach((taskId, index) => {
        const closedAt = taskId === input.taskId ? nextClosedAt : undefined;
        db.run(
          `UPDATE task
             SET list_id = ?, status_id = ?, sort_order = ?, updated_at = ?, closed_at = COALESCE(?, closed_at)
           WHERE id = ? AND board_id = ?`,
          [toListId, toStatus, index, now, closedAt ?? null, taskId, boardId],
        );
      });
    } else {
      const nextSource = sourceBandIds.filter((id) => id !== input.taskId);
      nextSource.forEach((taskId, index) => {
        db.run(
          "UPDATE task SET sort_order = ?, updated_at = ? WHERE id = ? AND board_id = ?",
          [index, now, taskId, boardId],
        );
      });
      destinationOrder.forEach((taskId, index) => {
        if (taskId === input.taskId) {
          db.run(
            `UPDATE task
               SET list_id = ?, status_id = ?, sort_order = ?, updated_at = ?, closed_at = ?
             WHERE id = ? AND board_id = ?`,
            [toListId, toStatus, index, now, nextClosedAt, taskId, boardId],
          );
          return;
        }
        db.run(
          "UPDATE task SET sort_order = ?, updated_at = ? WHERE id = ? AND board_id = ?",
          [index, now, taskId, boardId],
        );
      });
    }
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });

  return loadBoard(boardId);
}
