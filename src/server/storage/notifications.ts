import type { Database } from "bun:sqlite";
import {
  NOTIFICATION_RETENTION_LIMIT,
  type NotificationEntityType,
  type NotificationFeedSourceFilter,
  type NotificationItem,
  type NotificationPayload,
  type NotificationSourceType,
  type NotificationsPage,
} from "../../shared/notifications";
import { getDb } from "../db";

type NotificationRow = {
  id: number;
  created_at: string;
  read_at: string | null;
  board_id: number | null;
  list_id: number | null;
  task_id: number | null;
  entity_type: string;
  action_type: string;
  source_type: string;
  client_id: string | null;
  client_name: string | null;
  client_instance_id: string | null;
  message: string;
  payload_json: string;
};

export type InsertNotificationInput = {
  boardId: number | null;
  listId: number | null;
  taskId: number | null;
  entityType: NotificationEntityType;
  actionType: string;
  sourceType: NotificationSourceType;
  clientId: string | null;
  clientName: string | null;
  clientInstanceId: string | null;
  message: string;
  payload: NotificationPayload;
};

function normalizeSourceType(raw: string): NotificationSourceType {
  if (raw === "api") return "system";
  return raw as NotificationSourceType;
}

function mapRow(row: NotificationRow): NotificationItem {
  let payload: NotificationPayload = {};
  try {
    payload = JSON.parse(row.payload_json) as NotificationPayload;
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    createdAt: row.created_at,
    readAt: row.read_at,
    boardId: row.board_id,
    listId: row.list_id,
    taskId: row.task_id,
    entityType: row.entity_type as NotificationEntityType,
    actionType: row.action_type,
    sourceType: normalizeSourceType(row.source_type),
    clientId: row.client_id,
    clientName: row.client_name,
    clientInstanceId: row.client_instance_id,
    message: row.message,
    payload,
  };
}

function readNotificationRowById(db: Database, id: number): NotificationRow | null {
  return db
    .query(
      "SELECT id, created_at, read_at, board_id, list_id, task_id, entity_type, action_type, source_type, client_id, client_name, client_instance_id, message, payload_json FROM notification_event WHERE id = ?",
    )
    .get(id) as NotificationRow | null;
}

/** Keep only the newest N rows so notification history stays bounded (see notifications design). */
function pruneNotificationEvents(db: Database): void {
  db.run(
    `DELETE FROM notification_event WHERE id NOT IN (
      SELECT id FROM notification_event ORDER BY created_at DESC LIMIT ?
    )`,
    [NOTIFICATION_RETENTION_LIMIT],
  );
}

/** Insert one notification row, prune retention, and return the persisted item. */
export function insertNotificationEvent(input: InsertNotificationInput): NotificationItem {
  const db = getDb();
  const createdAt = new Date().toISOString();
  const payloadJson = JSON.stringify(input.payload);
  const result = db.run(
    `INSERT INTO notification_event (
      created_at, read_at, board_id, list_id, task_id,
      entity_type, action_type, source_type,
      client_id, client_name, client_instance_id,
      message, payload_json
    ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      createdAt,
      input.boardId,
      input.listId,
      input.taskId,
      input.entityType,
      input.actionType,
      input.sourceType,
      input.clientId,
      input.clientName,
      input.clientInstanceId,
      input.message,
      payloadJson,
    ],
  );
  pruneNotificationEvents(db);
  const row = readNotificationRowById(db, Number(result.lastInsertRowid));
  if (!row) {
    throw new Error("Failed to load notification after insert");
  }
  return mapRow(row);
}

/** Unread rows (any source). Prefer `countUnreadExternalNotifications` for header badge semantics. */
export function countUnreadNotifications(): number {
  const db = getDb();
  const row = db
    .query(
      "SELECT COUNT(*) AS c FROM notification_event WHERE read_at IS NULL",
    )
    .get() as { c: number };
  return row.c;
}

/** Red badge: unread non-web-app activity (`cli` + `system`), matching Phase 4 product rules. */
export function countUnreadExternalNotifications(): number {
  const db = getDb();
  const row = db
    .query(
      `SELECT COUNT(*) AS c FROM notification_event
       WHERE read_at IS NULL AND source_type IN ('cli', 'system', 'api')`,
    )
    .get() as { c: number };
  return row.c;
}

export function markAllNotificationsRead(): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.run("UPDATE notification_event SET read_at = ? WHERE read_at IS NULL", [
    now,
  ]);
}

export type ListNotificationsOptions = {
  scope: "all" | "board";
  boardId: number | null;
  /** Feed filter by writer kind; `all` shows every stored row. */
  sourceFilter: NotificationFeedSourceFilter;
  limit: number;
};

export function listNotifications(
  opts: ListNotificationsOptions,
): NotificationsPage {
  const db = getDb();
  const unreadCount = countUnreadExternalNotifications();

  let sql =
    "SELECT id, created_at, read_at, board_id, list_id, task_id, entity_type, action_type, source_type, client_id, client_name, client_instance_id, message, payload_json FROM notification_event WHERE 1=1";
  const params: unknown[] = [];

  if (opts.scope === "board" && opts.boardId != null) {
    sql += " AND board_id = ?";
    params.push(opts.boardId);
  }

  if (opts.sourceFilter === "ui") {
    sql += " AND source_type = 'ui'";
  } else if (opts.sourceFilter === "cli") {
    sql += " AND source_type = 'cli'";
  } else if (opts.sourceFilter === "system") {
    sql += " AND (source_type = 'system' OR source_type = 'api')";
  }

  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(opts.limit);

  const rows = db.query(sql).all(
    ...(params as (string | number | null)[]),
  ) as NotificationRow[];
  return {
    items: rows.map(mapRow),
    unreadCount,
    nextCursor: null,
  };
}
