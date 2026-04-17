import type { Context } from "hono";
import {
  TASK_MANAGER_CLIENT_HEADER,
  TASK_MANAGER_CLIENT_HIROTM,
  TASK_MANAGER_CLIENT_INSTANCE_HEADER,
  TASK_MANAGER_CLIENT_NAME_HEADER,
} from "../../shared/boardCliAccess";
import type { NotificationSourceType } from "../../shared/notifications";

export type NotificationClientContext = {
  sourceType: NotificationSourceType;
  clientId: string | null;
  clientName: string | null;
  clientInstanceId: string | null;
};

function header(c: Context, name: string): string | null {
  const v = c.req.header(name) ?? c.req.header(name.toLowerCase());
  const t = typeof v === "string" ? v.trim() : "";
  return t.length > 0 ? t : null;
}

/** Derive notification source fields from request headers (CLI, web, or other API clients). */
export function parseNotificationClientContext(c: Context): NotificationClientContext {
  const rawClient = header(c, TASK_MANAGER_CLIENT_HEADER);
  const nameHeader = header(c, TASK_MANAGER_CLIENT_NAME_HEADER);
  const instance = header(c, TASK_MANAGER_CLIENT_INSTANCE_HEADER);

  let sourceType: NotificationSourceType;
  if (rawClient?.toLowerCase() === TASK_MANAGER_CLIENT_HIROTM) {
    sourceType = "cli";
  } else if (rawClient?.toLowerCase() === "web") {
    sourceType = "ui";
  } else if (rawClient) {
    // Unknown non-web clients: treat as system until first-class custom client ids exist.
    sourceType = "system";
  } else {
    sourceType = "ui";
  }

  const clientId = rawClient ?? "web";

  let clientName = nameHeader;
  if (!clientName) {
    if (rawClient?.toLowerCase() === TASK_MANAGER_CLIENT_HIROTM) {
      clientName = TASK_MANAGER_CLIENT_HIROTM;
    } else if (!rawClient || sourceType === "ui") {
      clientName = "User";
    } else {
      clientName = rawClient;
    }
  }

  return {
    sourceType,
    clientId,
    clientName,
    clientInstanceId: instance,
  };
}
