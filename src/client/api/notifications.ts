import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { NotificationFeedSourceFilter, NotificationsPage } from "../../shared/notifications";
import { withBrowserClientHeaders } from "./clientHeaders";
import { fetchJson } from "./queries";

export type NotificationFeedScope = "all" | "board";

export const notificationKeys = {
  all: ["notifications"] as const,
  feed: (
    scope: NotificationFeedScope,
    boardId: number | null,
    sourceFilter: NotificationFeedSourceFilter,
  ) => ["notifications", "feed", scope, boardId, sourceFilter] as const,
};

export async function fetchNotifications(input: {
  scope: NotificationFeedScope;
  boardId: number | null;
  sourceFilter: NotificationFeedSourceFilter;
  limit?: number;
}): Promise<NotificationsPage> {
  const params = new URLSearchParams();
  params.set("scope", input.scope);
  if (input.scope === "board" && input.boardId != null) {
    params.set("boardId", String(input.boardId));
  }
  params.set("source", input.sourceFilter);
  params.set("limit", String(input.limit ?? 50));
  return fetchJson<NotificationsPage>(`/api/notifications?${params.toString()}`);
}

export function useNotificationsFeed(input: {
  scope: NotificationFeedScope;
  boardId: number | null;
  sourceFilter: NotificationFeedSourceFilter;
  limit?: number;
}) {
  return useQuery({
    queryKey: notificationKeys.feed(input.scope, input.boardId, input.sourceFilter),
    queryFn: () => fetchNotifications(input),
  });
}

export function invalidateNotificationQueries(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: notificationKeys.all });
}

function markAllReadInCache(qc: QueryClient): void {
  const now = new Date().toISOString();
  qc.setQueriesData<NotificationsPage>({ queryKey: notificationKeys.all }, (current) => {
    if (!current) return current;
    return {
      ...current,
      items: current.items.map((item) => ({
        ...item,
        readAt: item.readAt ?? now,
      })),
      unreadCount: 0,
    };
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/notifications/read-all", {
        method: "PATCH",
        headers: withBrowserClientHeaders(),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || response.statusText);
      }
    },
    onSuccess: () => {
      // Mark cached rows read immediately so the badge clears as soon as the panel opens.
      markAllReadInCache(qc);
    },
  });
}
