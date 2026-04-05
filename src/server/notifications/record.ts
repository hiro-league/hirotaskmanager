import type { Context } from "hono";
import type { BoardIndexEntry, Board, List, Task } from "../../shared/models";
import {
  boardDisplayName,
  groupDisplayLabelForId,
  priorityDisplayLabel,
  priorityLabelForId,
} from "../../shared/models";
import type { ListDeleteResult, ListWriteResult } from "../storage/lists";
import type { TaskDeleteResult, TaskWriteResult } from "../storage/tasks";
import { getDb } from "../db";
import { publishNotificationCreated } from "../notificationEvents";
import {
  countUnreadExternalNotifications,
  insertNotificationEvent,
  type InsertNotificationInput,
} from "../storage/notifications";
import { statusIsClosed } from "../storage/helpers";
import { parseNotificationClientContext } from "./clientContext";

function commit(
  c: Context,
  input: Omit<
    InsertNotificationInput,
    "sourceType" | "clientId" | "clientName" | "clientInstanceId"
  >,
): void {
  const ctx = parseNotificationClientContext(c);
  const notification = insertNotificationEvent({
    ...input,
    sourceType: ctx.sourceType,
    clientId: ctx.clientId,
    clientName: ctx.clientName,
    clientInstanceId: ctx.clientInstanceId,
  });
  publishNotificationCreated({
    kind: "notification-created",
    notification,
    unreadCount: countUnreadExternalNotifications(),
  });
}

function statusLabel(statusId: string): string {
  const row = getDb()
    .query("SELECT label FROM status WHERE id = ?")
    .get(statusId) as { label: string } | null;
  return row?.label ?? statusId;
}

function payloadBoard(
  entry: BoardIndexEntry,
  board: Board | null,
): import("../../shared/notifications").NotificationPayload {
  return {
    boardName: board?.name ?? entry.name,
    boardSlug: board?.slug ?? entry.slug,
    boardEmoji: board?.emoji ?? entry.emoji ?? null,
  };
}

function payloadList(
  entry: BoardIndexEntry,
  board: Board | null,
  list: List,
): import("../../shared/notifications").NotificationPayload {
  return {
    ...payloadBoard(entry, board),
    listName: list.name,
    listEmoji: list.emoji ?? null,
  };
}

function payloadTask(
  entry: BoardIndexEntry,
  board: Board | null,
  list: List | null,
  task: Task,
): import("../../shared/notifications").NotificationPayload {
  const base = payloadBoard(entry, board);
  if (list) {
    base.listName = list.name;
    base.listEmoji = list.emoji ?? null;
  }
  return {
    ...base,
    taskTitle: task.title,
    taskEmoji: task.emoji ?? null,
  };
}

export function recordBoardCreated(c: Context, board: Board): void {
  commit(c, {
    boardId: board.id,
    listId: null,
    taskId: null,
    entityType: "board",
    actionType: "board.created",
    message: `Board created: ${boardDisplayName(board)}`,
    payload: {
      boardName: board.name,
      boardSlug: board.slug ?? "",
      boardEmoji: board.emoji ?? null,
    },
  });
}

export function recordBoardDeleted(
  c: Context,
  entry: BoardIndexEntry,
  snapshot: Board,
): void {
  commit(c, {
    boardId: entry.id,
    listId: null,
    taskId: null,
    entityType: "board",
    actionType: "board.deleted",
    message: `Board deleted: ${boardDisplayName(snapshot)}`,
    payload: payloadBoard(entry, snapshot),
  });
}

export function recordBoardPatched(c: Context, entry: BoardIndexEntry, saved: Board): void {
  commit(c, {
    boardId: entry.id,
    listId: null,
    taskId: null,
    entityType: "board",
    actionType: "board.updated",
    message: `Board updated: ${boardDisplayName(saved)}`,
    payload: { ...payloadBoard(entry, saved), detail: "metadata" },
  });
}

/** View/preference PATCHes are intentionally not recorded as notifications (Phase 4). */

export function recordBoardTaskGroups(
  c: Context,
  entry: BoardIndexEntry,
  saved: Board,
): void {
  commit(c, {
    boardId: entry.id,
    listId: null,
    taskId: null,
    entityType: "board",
    actionType: "board.task_groups_updated",
    message: `Task groups updated: ${boardDisplayName(saved)}`,
    payload: { ...payloadBoard(entry, saved), detail: "task groups" },
  });
}

export function recordBoardTaskPriorities(
  c: Context,
  entry: BoardIndexEntry,
  saved: Board,
): void {
  commit(c, {
    boardId: entry.id,
    listId: null,
    taskId: null,
    entityType: "board",
    actionType: "board.task_priorities_updated",
    message: `Task priorities updated: ${boardDisplayName(saved)}`,
    payload: { ...payloadBoard(entry, saved), detail: "task priorities" },
  });
}

export function recordListCreated(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  result: ListWriteResult,
): void {
  commit(c, {
    boardId: result.boardId,
    listId: result.list.id,
    taskId: null,
    entityType: "list",
    actionType: "list.created",
    message: `List created: ${result.list.name}`,
    payload: payloadList(entry, board, result.list),
  });
}

export function recordListUpdated(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  result: ListWriteResult,
): void {
  commit(c, {
    boardId: result.boardId,
    listId: result.list.id,
    taskId: null,
    entityType: "list",
    actionType: "list.updated",
    message: `List updated: ${result.list.name}`,
    payload: payloadList(entry, board, result.list),
  });
}

export function recordListDeleted(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  listSnapshot: List,
  result: ListDeleteResult,
): void {
  commit(c, {
    boardId: result.boardId,
    listId: result.deletedListId,
    taskId: null,
    entityType: "list",
    actionType: "list.deleted",
    message: `List deleted: ${listSnapshot.name}`,
    payload: payloadList(entry, board, listSnapshot),
  });
}

export function recordListMoved(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  listId: number,
): void {
  const list = board.lists.find((l) => l.id === listId);
  const name = list?.name ?? `List #${listId}`;
  commit(c, {
    boardId: entry.id,
    listId,
    taskId: null,
    entityType: "list",
    actionType: "list.moved",
    message: `List moved: ${name}`,
    payload: list
      ? payloadList(entry, board, list)
      : { ...payloadBoard(entry, board), listName: name },
  });
}

export function recordListsReordered(c: Context, entry: BoardIndexEntry, board: Board): void {
  commit(c, {
    boardId: entry.id,
    listId: null,
    taskId: null,
    entityType: "list",
    actionType: "lists.reordered",
    message: `Lists reordered: ${boardDisplayName(board)}`,
    payload: payloadBoard(entry, board),
  });
}

export function recordTaskCreated(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  result: TaskWriteResult,
): void {
  const list = board.lists.find((l) => l.id === result.task.listId);
  commit(c, {
    boardId: result.boardId,
    listId: result.task.listId,
    taskId: result.task.id,
    entityType: "task",
    actionType: "task.created",
    message: `Task created: ${result.task.title || "Untitled"}`,
    payload: payloadTask(entry, board, list ?? null, result.task),
  });
}

export function recordTaskUpdated(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  before: Task,
  result: TaskWriteResult,
): void {
  const after = result.task;
  const list = board.lists.find((l) => l.id === after.listId);
  const title = after.title.trim() || "Untitled";
  const db = getDb();

  const notifications: Array<{ actionType: string; message: string }> = [];

  if (before.status !== after.status) {
    const beforeClosed = statusIsClosed(db, before.status);
    const afterClosed = statusIsClosed(db, after.status);
    if (afterClosed && !beforeClosed) {
      notifications.push({
        actionType: "task.completed",
        message: `Task completed: ${title}`,
      });
    } else if (!afterClosed && beforeClosed) {
      notifications.push({
        actionType: "task.reopened",
        message: `Task reopened: ${title}`,
      });
    } else if (after.status === "in-progress" && before.status !== "in-progress") {
      notifications.push({
        actionType: "task.status_in_progress",
        message: `Task set in progress: ${title}`,
      });
    } else {
      notifications.push({
        actionType: "task.status_changed",
        message: `Task status: ${statusLabel(before.status)} → ${statusLabel(after.status)} (${title})`,
      });
    }
  }

  if (before.priorityId !== after.priorityId) {
    const plBefore = priorityLabelForId(board.taskPriorities, before.priorityId);
    const plAfter = priorityLabelForId(board.taskPriorities, after.priorityId);
    const dispBefore = plBefore ? priorityDisplayLabel(plBefore) : "None";
    const dispAfter = plAfter ? priorityDisplayLabel(plAfter) : "None";
    notifications.push({
      actionType: "task.priority_changed",
      message: `Task priority: ${dispBefore} → ${dispAfter} (${title})`,
    });
  }

  if (before.groupId !== after.groupId) {
    const gBefore = groupDisplayLabelForId(board.taskGroups, before.groupId);
    const gAfter = groupDisplayLabelForId(board.taskGroups, after.groupId);
    notifications.push({
      actionType: "task.group_changed",
      message: `Task group: ${gBefore} → ${gAfter} (${title})`,
    });
  }

  // One task PATCH can carry multiple first-class changes, so emit one row per
  // meaningful domain change instead of letting the first match hide the rest.
  if (notifications.length === 0) {
    notifications.push({
      actionType: "task.updated",
      message: `Task updated: ${title}`,
    });
  }

  for (const notification of notifications) {
    commit(c, {
      boardId: result.boardId,
      listId: after.listId,
      taskId: after.id,
      entityType: "task",
      actionType: notification.actionType,
      message: notification.message,
      payload: payloadTask(entry, board, list ?? null, after),
    });
  }
}

export function recordTaskDeleted(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  taskSnapshot: Task,
  result: TaskDeleteResult,
): void {
  const list = board.lists.find((l) => l.id === taskSnapshot.listId);
  commit(c, {
    boardId: result.boardId,
    listId: taskSnapshot.listId,
    taskId: result.deletedTaskId,
    entityType: "task",
    actionType: "task.deleted",
    message: `Task deleted: ${taskSnapshot.title || "Untitled"}`,
    payload: payloadTask(entry, board, list ?? null, taskSnapshot),
  });
}

export function recordTaskMoved(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  taskId: number,
): void {
  const task = board.tasks.find((t) => t.id === taskId);
  const list = task
    ? board.lists.find((l) => l.id === task.listId)
    : undefined;
  const title = task?.title ?? `Task #${taskId}`;
  commit(c, {
    boardId: entry.id,
    listId: task?.listId ?? null,
    taskId,
    entityType: "task",
    actionType: "task.moved",
    message: `Task moved: ${title}`,
    payload: task
      ? payloadTask(entry, board, list ?? null, task)
      : { ...payloadBoard(entry, board), taskTitle: title },
  });
}

export function recordTasksReordered(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  listId: number,
  status: string,
): void {
  const list = board.lists.find((l) => l.id === listId);
  const listPart = list ? list.name : `List #${listId}`;
  commit(c, {
    boardId: entry.id,
    listId,
    taskId: null,
    entityType: "task",
    actionType: "tasks.reordered",
    message: `Tasks reordered in ${listPart} (${status})`,
    payload: {
      ...payloadBoard(entry, board),
      listName: list?.name ?? null,
      listEmoji: list?.emoji ?? null,
      detail: status,
    },
  });
}
