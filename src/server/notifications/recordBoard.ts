import type { Context } from "hono";
import type { BoardIndexEntry, Board } from "../../shared/models";
import { boardDisplayName } from "../../shared/models";
import { commitNotification, payloadBoard } from "./recordShared";

export function recordBoardCreated(c: Context, board: Board): void {
  commitNotification(c, {
    boardId: board.boardId,
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

export function recordBoardTrashed(
  c: Context,
  entry: BoardIndexEntry,
  snapshot: Board,
): void {
  commitNotification(c, {
    boardId: entry.boardId,
    listId: null,
    taskId: null,
    entityType: "board",
    actionType: "board.trashed",
    message: `Board moved to Trash: ${boardDisplayName(snapshot)}`,
    payload: payloadBoard(entry, snapshot),
  });
}

export function recordBoardPatched(c: Context, entry: BoardIndexEntry, saved: Board): void {
  commitNotification(c, {
    boardId: entry.boardId,
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
  commitNotification(c, {
    boardId: entry.boardId,
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
  commitNotification(c, {
    boardId: entry.boardId,
    listId: null,
    taskId: null,
    entityType: "board",
    actionType: "board.task_priorities_updated",
    message: `Task priorities updated: ${boardDisplayName(saved)}`,
    payload: { ...payloadBoard(entry, saved), detail: "task priorities" },
  });
}

export function recordBoardRestored(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
): void {
  commitNotification(c, {
    boardId: entry.boardId,
    listId: null,
    taskId: null,
    entityType: "board",
    actionType: "board.restored",
    message: `Board restored: ${boardDisplayName(board)}`,
    payload: payloadBoard(entry, board),
  });
}

export function recordBoardPurged(c: Context, entry: BoardIndexEntry): void {
  commitNotification(c, {
    boardId: entry.boardId,
    listId: null,
    taskId: null,
    entityType: "board",
    actionType: "board.permanently_deleted",
    message: `Board permanently deleted: ${boardDisplayName(entry)}`,
    payload: payloadBoard(entry, null),
  });
}
