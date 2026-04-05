/** Max rows kept in `notification_event` (newest first). Central constant for retention pruning. */
export const NOTIFICATION_RETENTION_LIMIT = 1000;

export type NotificationEntityType = "board" | "list" | "task";

/** Who caused the write: web app, CLI, or system/automation. Legacy DB rows may still store `api`; they are normalized to `system` when read. */
export type NotificationSourceType = "ui" | "cli" | "system";

/** Panel feed filter for `GET /api/notifications`; default in UI is `cli`. */
export type NotificationFeedSourceFilter = "all" | "ui" | "cli" | "system";

/** Structured snapshot for display and deep links; stored as JSON in `payload_json`. */
export type NotificationPayload = {
  boardName?: string;
  boardSlug?: string;
  boardEmoji?: string | null;
  listName?: string | null;
  listEmoji?: string | null;
  taskTitle?: string | null;
  taskEmoji?: string | null;
  /** Extra context, e.g. which board metadata area changed */
  detail?: string;
};

/** API shape for `GET /api/notifications`. */
export type NotificationItem = {
  id: number;
  createdAt: string;
  readAt: string | null;
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

export type NotificationsPage = {
  items: NotificationItem[];
  unreadCount: number;
  nextCursor: string | null;
};

export type NotificationCreatedEvent = {
  kind: "notification-created";
  notification: NotificationItem;
  unreadCount: number;
};
