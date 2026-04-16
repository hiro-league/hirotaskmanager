import type { Context } from "hono";
import type { BoardIndexEntry, Board, List, Task } from "../../shared/models";
import { getDb } from "../db";
import { publishNotificationCreated } from "../notificationEvents";
import {
  countUnreadExternalNotifications,
  insertNotificationEvent,
  type InsertNotificationInput,
} from "../storage/notifications";
import { parseNotificationClientContext } from "./clientContext";

export function commitNotification(
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

export function statusLabel(statusId: string): string {
  const row = getDb()
    .query("SELECT label FROM status WHERE id = ?")
    .get(statusId) as { label: string } | null;
  return row?.label ?? statusId;
}

export function payloadBoard(
  entry: BoardIndexEntry,
  board: Board | null,
): import("../../shared/notifications").NotificationPayload {
  return {
    boardName: board?.name ?? entry.name,
    boardSlug: board?.slug ?? entry.slug,
    boardEmoji: board?.emoji ?? entry.emoji ?? null,
  };
}

export function payloadList(
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

export function payloadTask(
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
