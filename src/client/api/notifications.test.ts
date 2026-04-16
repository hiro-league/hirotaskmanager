import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { invalidateNotificationQueries, notificationKeys } from "./notifications";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notifications query keys and invalidation", () => {
  test("notificationKeys.feed is stable for the same inputs", () => {
    expect(notificationKeys.feed("all", null, "cli")).toEqual([
      "notifications",
      "feed",
      "all",
      null,
      "cli",
    ]);
    expect(notificationKeys.feed("board", 3, "system")).toEqual([
      "notifications",
      "feed",
      "board",
      3,
      "system",
    ]);
  });

  test("invalidateNotificationQueries targets the notifications root key", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    invalidateNotificationQueries(qc);
    expect(spy).toHaveBeenCalledWith({ queryKey: notificationKeys.all });
  });
});
