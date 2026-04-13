import type { RestoreOutcome } from "../../shared/trashApi";
import {
  coerceTaskStatus,
  NONE_TASK_PRIORITY_VALUE,
} from "../../shared/models";
import type { Board, Task } from "../../shared/models";
import type { CreatorPrincipalType } from "../../shared/provenance";
import { normalizeStoredTaskTitle } from "../../shared/taskTitle";
import type { RowProvenance } from "../provenance";
import { getDb, withTransaction } from "../db";
import { boardExists, statusIsClosed } from "./helpers";
import { loadBoard } from "./board";
import { releaseBelongsToBoard } from "./releases";

type TaskRow = {
  id: number;
  list_id: number;
  group_id: number;
  priority_id: number;
  status_id: string;
  title: string;
  body: string;
  sort_order: number;
  color: string | null;
  emoji: string | null;
  release_id?: number | null;
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
    taskId: t.id,
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
    releaseId: t.release_id ?? null,
  };
}

/** Phase 2: small task writes read back one task row instead of reloading the full board. */
/** Task row for CLI policy when the task may be trashed. */
export function readTaskSnapshotById(boardId: number, taskId: number): Task | null {
  const db = getDb();
  const row = db
    .query(
      `SELECT id, list_id, group_id, priority_id, status_id, title, body, sort_order, color, emoji, release_id,
              created_at, updated_at, closed_at, created_by_principal, created_by_label
       FROM task WHERE id = ? AND board_id = ?`,
    )
    .get(taskId, boardId) as TaskRow | null;
  return row ? mapTaskRow(row) : null;
}

/**
 * `releaseId` on create: omitted → optional auto-assign from board flags + principal;
 * `null` → force untagged; a number → must belong to the board or `"invalid"`.
 */
function resolveReleaseIdOnTaskCreate(
  db: ReturnType<typeof getDb>,
  boardId: number,
  explicit: number | null | undefined,
  principal: CreatorPrincipalType,
): number | null | "invalid" {
  if (explicit === null) return null;
  if (explicit !== undefined) {
    return releaseBelongsToBoard(db, boardId, explicit) ? explicit : "invalid";
  }
  const row = db
    .query(
      "SELECT default_release_id, auto_assign_release_ui, auto_assign_release_cli FROM board WHERE id = ?",
    )
    .get(boardId) as {
    default_release_id: number | null;
    auto_assign_release_ui: number;
    auto_assign_release_cli: number;
  } | null;
  const def = row?.default_release_id ?? null;
  if (def == null) return null;
  if (principal === "web" && row!.auto_assign_release_ui) return def;
  if (principal === "cli" && row!.auto_assign_release_cli) return def;
  return null;
}

function nonePriorityRowId(db: ReturnType<typeof getDb>, boardId: number): number | null {
  const row = db
    .query(
      "SELECT id FROM task_priority WHERE board_id = ? AND value = ?",
    )
    .get(boardId, NONE_TASK_PRIORITY_VALUE) as { id: number } | null;
  return row?.id ?? null;
}

export function readTaskById(boardId: number, taskId: number): Task | null {
  const db = getDb();
  const row = db
    .query(
      `SELECT t.id, t.list_id, t.group_id, t.priority_id, t.status_id, t.title, t.body, t.sort_order, t.color, t.emoji, t.release_id,
              t.created_at, t.updated_at, t.closed_at, t.created_by_principal, t.created_by_label
       FROM task t
       INNER JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
       INNER JOIN board b ON b.id = t.board_id
       WHERE t.id = ? AND t.board_id = ? AND t.deleted_at IS NULL AND l.deleted_at IS NULL AND b.deleted_at IS NULL`,
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
    /** Omitted → board builtin `none` priority (`value` 0). */
    priorityId?: number;
    emoji?: string | null;
    /**
     * Omitted → apply board auto-assign when enabled for this principal.
     * `null` → force untagged (no auto-assign).
     */
    releaseId?: number | null;
  },
  provenance?: RowProvenance,
): TaskWriteResult | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;

  const listRow = db
    .query(
      "SELECT l.id FROM list l INNER JOIN board b ON b.id = l.board_id WHERE l.id = ? AND l.board_id = ? AND l.deleted_at IS NULL AND b.deleted_at IS NULL",
    )
    .get(input.listId, boardId) as { id: number } | null;
  if (!listRow) return null;

  const gRow = db
    .query("SELECT id FROM task_group WHERE id = ? AND board_id = ?")
    .get(input.groupId, boardId) as { id: number } | null;
  if (!gRow) return null;

  // Omitted `priorityId` uses the board's builtin `none` row (`task_priority.value` = 0).
  const priorityId =
    input.priorityId !== undefined
      ? input.priorityId
      : nonePriorityRowId(db, boardId);
  if (priorityId == null) return null;
  const pRow = db
    .query("SELECT id FROM task_priority WHERE id = ? AND board_id = ?")
    .get(priorityId, boardId) as { id: number } | null;
  if (!pRow) return null;

  const allowedStatusIds = (
    db.query("SELECT id FROM status ORDER BY sort_order ASC, id ASC").all() as {
      id: string;
    }[]
  ).map((r) => r.id);
  const statusId = coerceTaskStatus(input.status, allowedStatusIds);

  const bandRows = db
    .query(
      `SELECT t.sort_order FROM task t
       INNER JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
       WHERE t.board_id = ? AND t.list_id = ? AND t.status_id = ? AND t.deleted_at IS NULL AND l.deleted_at IS NULL`,
    )
    .all(boardId, input.listId, statusId) as { sort_order: number }[];
  const maxOrder = bandRows.reduce(
    (m, r) => Math.max(m, r.sort_order),
    -1,
  );

  const now = new Date().toISOString();
  const closedAt = statusIsClosed(db, statusId) ? now : null;
  const emoji = input.emoji ?? null;
  // Enforce max title length in grapheme clusters (shared with client; see `shared/taskTitle.ts`).
  const titleStored = normalizeStoredTaskTitle(input.title);
  const principal = provenance?.principal ?? "web";
  const label = provenance?.label ?? null;
  const resolvedRelease = resolveReleaseIdOnTaskCreate(
    db,
    boardId,
    input.releaseId,
    principal,
  );
  if (resolvedRelease === "invalid") return null;
  let taskId: number | null = null;
  withTransaction(db, () => {
    const result = db.run(
      `INSERT INTO task (list_id, group_id, priority_id, board_id, status_id,
         title, body, sort_order, color, emoji, release_id, created_at, updated_at, closed_at,
         created_by_principal, created_by_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.listId,
        input.groupId,
        priorityId,
        boardId,
        statusId,
        titleStored,
        input.body,
        maxOrder + 1,
        null,
        emoji,
        resolvedRelease,
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
    priorityId: number;
    status: string;
    order: number;
    color: string | null;
    emoji: string | null;
    releaseId: number | null;
  }>,
): TaskWriteResult | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;

  const trow = db
    .query(
      `SELECT t.id, t.list_id, t.group_id, t.priority_id, t.status_id, t.title, t.body, t.sort_order, t.color, t.emoji, t.release_id, t.created_at, t.updated_at, t.closed_at
       FROM task t
       INNER JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
       INNER JOIN board b ON b.id = t.board_id
       WHERE t.id = ? AND t.board_id = ? AND t.deleted_at IS NULL AND l.deleted_at IS NULL AND b.deleted_at IS NULL`,
    )
    .get(taskId, boardId) as TaskRow | null;
  if (!trow) return null;

  let releaseId =
    patch.releaseId !== undefined ? patch.releaseId : (trow.release_id ?? null);
  if (releaseId != null && !releaseBelongsToBoard(db, boardId, releaseId)) {
    return null;
  }

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
    .query(
      "SELECT l.id FROM list l INNER JOIN board b ON b.id = l.board_id WHERE l.id = ? AND l.board_id = ? AND l.deleted_at IS NULL AND b.deleted_at IS NULL",
    )
    .get(listId, boardId) as { id: number } | null;
  if (!listOk) return null;

  const gOk = db
    .query("SELECT id FROM task_group WHERE id = ? AND board_id = ?")
    .get(groupId, boardId) as { id: number } | null;
  if (!gOk) return null;

  const pOk = db
    .query("SELECT id FROM task_priority WHERE id = ? AND board_id = ?")
    .get(priorityId, boardId) as { id: number } | null;
  if (!pOk) return null;

  const statusChanged = trow.status_id !== statusId;
  const listChanged = trow.list_id !== listId;
  let order: number;
  if (statusChanged || listChanged) {
    const others = db
      .query(
        `SELECT t.sort_order FROM task t
         INNER JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
         WHERE t.board_id = ? AND t.list_id = ? AND t.status_id = ? AND t.id != ? AND t.deleted_at IS NULL AND l.deleted_at IS NULL`,
      )
      .all(boardId, listId, statusId, taskId) as { sort_order: number }[];
    order = others.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;
  } else {
    order = patch.order ?? trow.sort_order;
  }

  const title =
    patch.title !== undefined
      ? normalizeStoredTaskTitle(patch.title)
      : trow.title;
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
         sort_order = ?, color = ?, emoji = ?, release_id = ?, updated_at = ?, closed_at = ? WHERE id = ?`,
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
        releaseId,
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

/** Normal delete: move task to Trash (soft delete). */
export function deleteTaskOnBoard(
  boardId: number,
  taskId: number,
): TaskDeleteResult | null {
  const db = getDb();
  if (!boardExists(db, boardId)) return null;
  const row = db
    .query(
      `SELECT t.id FROM task t
       INNER JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
       INNER JOIN board b ON b.id = t.board_id
       WHERE t.id = ? AND t.board_id = ? AND t.deleted_at IS NULL AND l.deleted_at IS NULL AND b.deleted_at IS NULL`,
    )
    .get(taskId, boardId) as { id: number } | null;
  if (!row) return null;
  const now = new Date().toISOString();
  withTransaction(db, () => {
    db.run("UPDATE task SET deleted_at = ? WHERE id = ?", [now, taskId]);
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  return { boardId, boardUpdatedAt: now, deletedTaskId: taskId };
}

export function restoreTaskOnBoard(
  boardId: number,
  taskId: number,
): RestoreOutcome<TaskWriteResult> {
  const db = getDb();
  const row = db
    .query(
      `SELECT t.deleted_at AS td, l.deleted_at AS ld, b.deleted_at AS bd
       FROM task t
       INNER JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
       INNER JOIN board b ON b.id = t.board_id
       WHERE t.id = ? AND t.board_id = ?`,
    )
    .get(taskId, boardId) as {
    td: string | null;
    ld: string | null;
    bd: string | null;
  } | null;
  if (!row || row.td == null) return { ok: false, reason: "not_found" };
  if (row.bd != null || row.ld != null) return { ok: false, reason: "conflict" };
  const now = new Date().toISOString();
  withTransaction(db, () => {
    db.run("UPDATE task SET deleted_at = NULL WHERE id = ?", [taskId]);
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [now, boardId]);
  });
  const task = readTaskById(boardId, taskId);
  if (!task) return { ok: false, reason: "not_found" };
  return { ok: true, value: { boardId, boardUpdatedAt: now, task } };
}

/** Permanent delete from Trash (row must be explicitly trashed). */
export function purgeTaskOnBoard(
  boardId: number,
  taskId: number,
): TaskDeleteResult | null {
  const db = getDb();
  const row = db
    .query(
      "SELECT id FROM task WHERE board_id = ? AND id = ? AND deleted_at IS NOT NULL",
    )
    .get(boardId, taskId) as { id: number } | null;
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
      `SELECT t.id FROM task t
       INNER JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
       WHERE t.board_id = ? AND t.list_id = ? AND t.status_id = ? AND t.deleted_at IS NULL AND l.deleted_at IS NULL
       ORDER BY t.sort_order, t.id`,
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
      `SELECT t.id, t.list_id, t.group_id, t.priority_id, t.status_id, t.title, t.body, t.sort_order, t.color, t.emoji, t.created_at, t.updated_at, t.closed_at
       FROM task t
       INNER JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
       INNER JOIN board b ON b.id = t.board_id
       WHERE t.id = ? AND t.board_id = ? AND t.deleted_at IS NULL AND l.deleted_at IS NULL AND b.deleted_at IS NULL`,
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
    .query(
      "SELECT l.id FROM list l INNER JOIN board b ON b.id = l.board_id WHERE l.id = ? AND l.board_id = ? AND l.deleted_at IS NULL AND b.deleted_at IS NULL",
    )
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
      `SELECT t.id FROM task t
       INNER JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
       WHERE t.board_id = ? AND t.list_id = ? AND t.status_id = ? AND t.deleted_at IS NULL AND l.deleted_at IS NULL
       ORDER BY t.sort_order ASC, t.id ASC`,
    ).all(boardId, sourceListId, sourceStatus) as { id: number }[]
  ).map((row) => row.id);

  const destinationBandWithoutTask = (
    db.query(
      `SELECT t.id FROM task t
       INNER JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
       WHERE t.board_id = ? AND t.list_id = ? AND t.status_id = ? AND t.id != ? AND t.deleted_at IS NULL AND l.deleted_at IS NULL
       ORDER BY t.sort_order ASC, t.id ASC`,
    ).all(boardId, toListId, toStatus, input.taskId) as { id: number }[]
  ).map((row) => row.id);

  if (input.beforeTaskId != null) {
    if (input.beforeTaskId === input.taskId) return null;
    const target = db
      .query(
        `SELECT t.list_id, t.status_id FROM task t
         INNER JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
         INNER JOIN board b ON b.id = t.board_id
         WHERE t.id = ? AND t.board_id = ? AND t.deleted_at IS NULL AND l.deleted_at IS NULL AND b.deleted_at IS NULL`,
      )
      .get(input.beforeTaskId, boardId) as {
      list_id: number;
      status_id: string;
    } | null;
    if (!target || target.list_id !== toListId || target.status_id !== toStatus) return null;
  }
  if (input.afterTaskId != null) {
    if (input.afterTaskId === input.taskId) return null;
    const target = db
      .query(
        `SELECT t.list_id, t.status_id FROM task t
         INNER JOIN list l ON l.id = t.list_id AND l.board_id = t.board_id
         INNER JOIN board b ON b.id = t.board_id
         WHERE t.id = ? AND t.board_id = ? AND t.deleted_at IS NULL AND l.deleted_at IS NULL AND b.deleted_at IS NULL`,
      )
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
