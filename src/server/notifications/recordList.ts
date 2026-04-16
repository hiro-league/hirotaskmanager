import type { Context } from "hono";
import type { BoardIndexEntry, Board, List } from "../../shared/models";
import { boardDisplayName } from "../../shared/models";
import type { ListDeleteResult, ListWriteResult } from "../storage/lists";
import { commitNotification, payloadBoard, payloadList } from "./recordShared";

export function recordListCreated(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  result: ListWriteResult,
): void {
  commitNotification(c, {
    boardId: result.boardId,
    listId: result.list.listId,
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
  commitNotification(c, {
    boardId: result.boardId,
    listId: result.list.listId,
    taskId: null,
    entityType: "list",
    actionType: "list.updated",
    message: `List updated: ${result.list.name}`,
    payload: payloadList(entry, board, result.list),
  });
}

export function recordListTrashed(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  listSnapshot: List,
  result: ListDeleteResult,
): void {
  commitNotification(c, {
    boardId: result.boardId,
    listId: result.deletedListId,
    taskId: null,
    entityType: "list",
    actionType: "list.trashed",
    message: `List moved to Trash: ${listSnapshot.name}`,
    payload: payloadList(entry, board, listSnapshot),
  });
}

export function recordListMoved(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  listId: number,
): void {
  const list = board.lists.find((l) => l.listId === listId);
  const name = list?.name ?? `List #${listId}`;
  commitNotification(c, {
    boardId: entry.boardId,
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
  commitNotification(c, {
    boardId: entry.boardId,
    listId: null,
    taskId: null,
    entityType: "list",
    actionType: "lists.reordered",
    message: `Lists reordered: ${boardDisplayName(board)}`,
    payload: payloadBoard(entry, board),
  });
}

export function recordListRestored(
  c: Context,
  entry: BoardIndexEntry,
  board: Board,
  list: List,
): void {
  commitNotification(c, {
    boardId: entry.boardId,
    listId: list.listId,
    taskId: null,
    entityType: "list",
    actionType: "list.restored",
    message: `List restored: ${list.name}`,
    payload: payloadList(entry, board, list),
  });
}

export function recordListPurged(
  c: Context,
  entry: BoardIndexEntry,
  board: Board | null,
  listSnapshot: List,
): void {
  const payload = board
    ? payloadList(entry, board, listSnapshot)
    : {
        ...payloadBoard(entry, null),
        listName: listSnapshot.name,
        listEmoji: listSnapshot.emoji ?? null,
      };
  commitNotification(c, {
    boardId: entry.boardId,
    listId: listSnapshot.listId,
    taskId: null,
    entityType: "list",
    actionType: "list.permanently_deleted",
    message: `List permanently deleted: ${listSnapshot.name}`,
    payload,
  });
}
