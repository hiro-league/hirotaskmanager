import type { Context } from "hono";
import type { BoardIndexEntry, Board, Task } from "../../shared/models";
import {
  groupDisplayLabelForId,
  priorityDisplayLabel,
  priorityLabelForId,
} from "../../shared/models";
import type { TaskDeleteResult, TaskWriteResult } from "../storage/tasks";
import { getDb } from "../db";
import { statusIsClosed } from "../storage/system/helpers";
import {
  commitNotification,
  payloadBoard,
  payloadTask,
  statusLabel,
} from "./recordShared";

export function recordTaskCreated(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  result: TaskWriteResult,
): void {
  const list = board.lists.find((l) => l.listId === result.task.listId);
  commitNotification(c, {
    boardId: result.boardId,
    listId: result.task.listId,
    taskId: result.task.taskId,
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
  const list = board.lists.find((l) => l.listId === after.listId);
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
    commitNotification(c, {
      boardId: result.boardId,
      listId: after.listId,
      taskId: after.taskId,
      entityType: "task",
      actionType: notification.actionType,
      message: notification.message,
      payload: payloadTask(entry, board, list ?? null, after),
    });
  }
}

export function recordTaskTrashed(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  taskSnapshot: Task,
  result: TaskDeleteResult,
): void {
  const list = board.lists.find((l) => l.listId === taskSnapshot.listId);
  commitNotification(c, {
    boardId: result.boardId,
    listId: taskSnapshot.listId,
    taskId: result.deletedTaskId,
    entityType: "task",
    actionType: "task.trashed",
    message: `Task moved to Trash: ${taskSnapshot.title || "Untitled"}`,
    payload: payloadTask(entry, board, list ?? null, taskSnapshot),
  });
}

export function recordTaskMoved(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  taskId: number,
): void {
  const task = board.tasks.find((t) => t.taskId === taskId);
  const list = task
    ? board.lists.find((l) => l.listId === task.listId)
    : undefined;
  const title = task?.title ?? `Task #${taskId}`;
  commitNotification(c, {
    boardId: entry.boardId,
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
  const list = board.lists.find((l) => l.listId === listId);
  const listPart = list ? list.name : `List #${listId}`;
  commitNotification(c, {
    boardId: entry.boardId,
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

export function recordTaskRestored(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  task: Task,
): void {
  const list = board.lists.find((l) => l.listId === task.listId);
  commitNotification(c, {
    boardId: entry.boardId,
    listId: task.listId,
    taskId: task.taskId,
    entityType: "task",
    actionType: "task.restored",
    message: `Task restored: ${task.title.trim() || "Untitled"}`,
    payload: payloadTask(entry, board, list ?? null, task),
  });
}

export function recordTaskPurged(
  c: Context,
  entry: BoardIndexEntry,
  board: Board | null,
  taskSnapshot: Task,
): void {
  const list = board?.lists.find((l) => l.listId === taskSnapshot.listId);
  const payload =
    board != null
      ? payloadTask(entry, board, list ?? null, taskSnapshot)
      : {
          ...payloadBoard(entry, null),
          taskTitle: taskSnapshot.title,
          taskEmoji: taskSnapshot.emoji ?? null,
        };
  commitNotification(c, {
    boardId: entry.boardId,
    listId: taskSnapshot.listId,
    taskId: taskSnapshot.taskId,
    entityType: "task",
    actionType: "task.permanently_deleted",
    message: `Task permanently deleted: ${taskSnapshot.title.trim() || "Untitled"}`,
    payload,
  });
}
