import { describe, expect, test } from "vitest";
import { formatNotificationTime } from "./notificationTime";

describe("formatNotificationTime", () => {
  test("invalid iso returns empty string", () => {
    expect(formatNotificationTime("not-a-date")).toBe("");
  });

  test("very recent shows now", () => {
    const now = new Date("2025-06-15T12:00:30.000Z");
    const iso = new Date("2025-06-15T12:00:15.000Z").toISOString();
    expect(formatNotificationTime(iso, now)).toBe("now");
  });

  test("minutes ago in first hour", () => {
    const now = new Date("2025-06-15T12:30:00.000Z");
    const iso = new Date("2025-06-15T12:05:00.000Z").toISOString();
    expect(formatNotificationTime(iso, now)).toBe("25 mins ago");
  });

  test("yesterday label", () => {
    const now = new Date("2025-06-15T12:00:00.000Z");
    const iso = new Date("2025-06-14T10:00:00.000Z").toISOString();
    expect(formatNotificationTime(iso, now)).toBe("yesterday");
  });
});
