import {
  ArrowRightLeft,
  Bot,
  CheckCircle2,
  ChevronsUp,
  ClipboardList,
  Columns3,
  GripHorizontal,
  LayoutGrid,
  Pencil,
  PlayCircle,
  Plus,
  RotateCcw,
  Settings,
  Tags,
  Trash2,
  User,
  type LucideIcon,
} from "lucide-react";
import type { NotificationItem } from "../../shared/notifications";

export type NotificationVisualSpec = {
  Icon: LucideIcon;
  className: string;
};

export function notificationActionVisual(item: NotificationItem): NotificationVisualSpec {
  const at = item.actionType;
  // Match both `*.trashed` (soft-delete) and `*.permanently_deleted` so trash-related
  // notifications all share the destructive trash glyph.
  if (at.includes("trashed") || at.includes("deleted")) {
    return { Icon: Trash2, className: "bg-destructive/12 text-destructive" };
  }
  // Before `created`: `task.completed` also contains the substring "created".
  if (at === "task.completed") {
    return { Icon: CheckCircle2, className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" };
  }
  if (at.includes("created")) {
    return { Icon: Plus, className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" };
  }
  if (at.includes("reopened")) {
    return { Icon: RotateCcw, className: "bg-sky-500/12 text-sky-700 dark:text-sky-400" };
  }
  if (at.includes("status_in_progress")) {
    return { Icon: PlayCircle, className: "bg-violet-500/12 text-violet-700 dark:text-violet-400" };
  }
  if (at.includes("priority_changed")) {
    return { Icon: ChevronsUp, className: "bg-amber-500/12 text-amber-700 dark:text-amber-400" };
  }
  if (at.includes("group_changed")) {
    return { Icon: Tags, className: "bg-teal-500/12 text-teal-700 dark:text-teal-400" };
  }
  if (at.includes("status_changed")) {
    return { Icon: ArrowRightLeft, className: "bg-sky-500/12 text-sky-700 dark:text-sky-400" };
  }
  if (at.includes("reordered")) {
    return { Icon: GripHorizontal, className: "bg-amber-500/12 text-amber-700 dark:text-amber-400" };
  }
  if (at.includes("moved")) {
    return { Icon: ArrowRightLeft, className: "bg-amber-500/12 text-amber-700 dark:text-amber-400" };
  }
  return { Icon: Pencil, className: "bg-sky-500/12 text-sky-700 dark:text-sky-400" };
}

/** Small icon inline before the message — entity kind, distinct from action + source. */
export function notificationEntityIcon(
  entityType: NotificationItem["entityType"],
): LucideIcon {
  if (entityType === "board") return LayoutGrid;
  if (entityType === "list") return Columns3;
  return ClipboardList;
}

export type NotificationSourceDisplay = {
  Icon: LucideIcon;
  /** Icon + label color (Phase 4: cli red, user blue). */
  className: string;
  label: string;
};

export function notificationSourceDisplay(item: NotificationItem): NotificationSourceDisplay {
  if (item.sourceType === "cli") {
    return {
      Icon: Bot,
      className: "text-red-600 dark:text-red-400",
      label: item.clientName?.trim() || "CLI",
    };
  }
  if (item.sourceType === "ui") {
    return {
      Icon: User,
      className: "text-blue-600 dark:text-blue-400",
      label: "User",
    };
  }
  return {
    Icon: Settings,
    className: "text-muted-foreground",
    label: "System",
  };
}

/**
 * Deep link for notification clicks: board-only, or with `#taskId=` / `#listId=` hash for scroll/select.
 * Hash keeps board query-string filters separate and avoids clashing with SPA navigation.
 *
 * Trashed actions deep-link to `/trash` so the user can review or restore the entity from the
 * panel; permanently-deleted rows have no link target.
 */
export function notificationTargetHref(item: NotificationItem): string | null {
  if (item.actionType.includes("trashed")) return "/trash";
  if (item.boardId == null) return null;
  if (item.actionType.includes("deleted")) return null;
  const base = `/board/${encodeURIComponent(String(item.boardId))}`;
  if (item.entityType === "task" && item.taskId != null) {
    return `${base}#taskId=${item.taskId}`;
  }
  if (item.entityType === "list" && item.listId != null) {
    return `${base}#listId=${item.listId}`;
  }
  if (
    item.entityType === "task" &&
    item.listId != null &&
    item.actionType.includes("reordered")
  ) {
    return `${base}#listId=${item.listId}`;
  }
  return base;
}

/** @deprecated Use `notificationTargetHref` for query-aware navigation. */
export function notificationTargetBoardPath(item: NotificationItem): string | null {
  return notificationTargetHref(item);
}

export function notificationContextLabel(item: NotificationItem): string {
  const parts = [item.payload.boardName, item.payload.listName, item.payload.detail].filter(Boolean);
  return parts.join(" • ");
}

export type NotificationRestoreTarget = {
  entityType: NotificationItem["entityType"];
  /** The id of the trashed entity to restore. */
  id: number;
  /** Best-effort display name for confirmation toasts; falls back to a generic label. */
  displayName: string;
};

/**
 * Resolves the restore target for a notification, or null if the notification does not represent
 * a trashing action with a usable id. Permanent deletions are intentionally excluded — there is
 * nothing to restore once a row is purged.
 */
export function notificationRestoreTarget(
  item: NotificationItem,
): NotificationRestoreTarget | null {
  if (!item.actionType.includes("trashed")) return null;
  if (item.actionType === "task.trashed" && item.taskId != null) {
    return {
      entityType: "task",
      id: item.taskId,
      displayName: item.payload.taskTitle?.trim() || "Task",
    };
  }
  if (item.actionType === "list.trashed" && item.listId != null) {
    return {
      entityType: "list",
      id: item.listId,
      displayName: item.payload.listName?.trim() || "List",
    };
  }
  if (item.actionType === "board.trashed" && item.boardId != null) {
    return {
      entityType: "board",
      id: item.boardId,
      displayName: item.payload.boardName?.trim() || "Board",
    };
  }
  return null;
}
