/** @vitest-environment jsdom */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { NotificationItem } from "../../../shared/notifications";
import { useNotificationUiStore } from "@/store/notificationUi";
import { resetNotificationUiStore } from "@/test/resetStores";
import { NotificationToasts } from "./NotificationToasts";

afterEach(() => {
  resetNotificationUiStore();
});

describe("NotificationToasts", () => {
  test("renders a system toast and dismisses via the button", async () => {
    const user = userEvent.setup();
    act(() => {
      useNotificationUiStore.getState().pushSystemToast("Connection warning");
    });

    render(
      <MemoryRouter>
        <NotificationToasts />
      </MemoryRouter>,
    );

    expect(screen.getByText("Connection warning")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("Connection warning")).toBeNull();
  });

  test("system toast with Undo invokes callback and dismisses", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    act(() => {
      useNotificationUiStore.getState().pushSystemToast({
        message: "Board moved to Trash (test)",
        onUndo,
        trashLink: true,
      });
    });

    render(
      <MemoryRouter>
        <NotificationToasts />
      </MemoryRouter>,
    );

    expect(screen.getByText("Board moved to Trash (test)")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^undo$/i }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Board moved to Trash (test)")).toBeNull();
  });

  test("renders a notification toast with the message text", () => {
    const item: NotificationItem = {
      id: 42,
      createdAt: "2025-01-01T12:00:00.000Z",
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
      message: "Phase 4 toast message unique",
      payload: {},
    };

    act(() => {
      useNotificationUiStore.getState().pushToast(item);
    });

    render(
      <MemoryRouter>
        <NotificationToasts />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Phase 4 toast message unique").length).toBeGreaterThanOrEqual(
      1,
    );
  });
});
