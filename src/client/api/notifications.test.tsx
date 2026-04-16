/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { NotificationsPage } from "../../shared/notifications";
import { notificationKeys, useMarkAllNotificationsRead } from "./notifications";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("useMarkAllNotificationsRead", () => {
  test("onSuccess marks cached feed rows read and clears unreadCount", async () => {
    const qc = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const page: NotificationsPage = {
      items: [
        {
          id: 1,
          createdAt: "2024-06-01T11:00:00.000Z",
          readAt: null,
          boardId: 1,
          listId: null,
          taskId: null,
          entityType: "task",
          actionType: "create",
          sourceType: "cli",
          clientId: null,
          clientName: null,
          clientInstanceId: null,
          message: "hi",
          payload: {},
        },
        {
          id: 2,
          createdAt: "2024-06-01T11:01:00.000Z",
          readAt: "2024-06-01T11:30:00.000Z",
          boardId: 1,
          listId: null,
          taskId: null,
          entityType: "task",
          actionType: "update",
          sourceType: "cli",
          clientId: null,
          clientName: null,
          clientInstanceId: null,
          message: "already read",
          payload: {},
        },
      ],
      unreadCount: 1,
      nextCursor: null,
    };
    const key = notificationKeys.feed("all", null, "cli");
    qc.setQueryData(key, page);

    vi.spyOn(Date.prototype, "toISOString").mockReturnValue(
      "2024-06-01T13:00:00.000Z",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => "",
      }),
    );

    const { result } = renderHook(() => useMarkAllNotificationsRead(), {
      wrapper: createWrapper(qc),
    });

    await result.current.mutateAsync();

    await waitFor(() => {
      const next = qc.getQueryData<NotificationsPage>(key);
      expect(next?.unreadCount).toBe(0);
      expect(next?.items[0]?.readAt).toBe("2024-06-01T13:00:00.000Z");
      expect(next?.items[1]?.readAt).toBe("2024-06-01T11:30:00.000Z");
    });
  });
});
