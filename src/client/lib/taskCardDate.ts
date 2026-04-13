import type { Task } from "../../shared/models";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** 12-hour time like 11:05PM (no space before AM/PM), per task card spec. */
export function formatTaskCardTime12hCompact(d: Date): string {
  const h24 = d.getHours();
  const m = d.getMinutes();
  const isAm = h24 < 12;
  const h12 = h24 % 12 || 12;
  const mm = m.toString().padStart(2, "0");
  return `${h12}:${mm}${isAm ? "AM" : "PM"}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days from `date` to `now` (0 = same day; positive = date is in the past). */
function calendarDaysFromDateToNow(date: Date, now: Date): number {
  const a = startOfLocalDay(date).getTime();
  const b = startOfLocalDay(now).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function sixMonthsBefore(now: Date): Date {
  const x = new Date(now);
  x.setMonth(x.getMonth() - 6);
  return x;
}

/** Same-calendar-day tasks opened/closed within this window show “now” + a dot on the card. */
export const TASK_CARD_RECENT_WINDOW_MS = 5 * 60 * 1000;

export type TaskCardRelativeDateParts = {
  label: string;
  /** When true, the card shows a blue dot instead of the clock icon (recent “now” state). */
  showRecentDot: boolean;
};

/**
 * Short label for large/larger task cards: today → time only (or “now” if very recent);
 * 1–3 days ago; then MMM d; if older than six months and a different calendar year than now → year only.
 */
export function getTaskCardRelativeDateParts(
  iso: string,
  now: Date = new Date(),
): TaskCardRelativeDateParts {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { label: "", showRecentDot: false };

  const deltaDays = calendarDaysFromDateToNow(date, now);

  if (deltaDays === 0) {
    const ageMs = now.getTime() - date.getTime();
    if (ageMs >= 0 && ageMs <= TASK_CARD_RECENT_WINDOW_MS) {
      return { label: "now", showRecentDot: true };
    }
    return { label: formatTaskCardTime12hCompact(date), showRecentDot: false };
  }
  if (deltaDays === 1) return { label: "1 day ago", showRecentDot: false };
  if (deltaDays === 2) return { label: "2 days ago", showRecentDot: false };
  if (deltaDays === 3) return { label: "3 days ago", showRecentDot: false };

  const sixAgo = sixMonthsBefore(now);
  if (date < sixAgo && date.getFullYear() !== now.getFullYear()) {
    return { label: String(date.getFullYear()), showRecentDot: false };
  }

  return { label: `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`, showRecentDot: false };
}

export function formatTaskCardRelativeDate(iso: string, now: Date = new Date()): string {
  return getTaskCardRelativeDateParts(iso, now).label;
}

/** Hover / aria: "Opened on 14 Apr 2026 11:05PM" or "Closed on …". */
export function formatTaskCardDateTooltip(kind: "opened" | "closed", iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const prefix = kind === "closed" ? "Closed on" : "Opened on";
  const d = date.getDate();
  const mon = MONTHS_SHORT[date.getMonth()];
  const y = date.getFullYear();
  const t = formatTaskCardTime12hCompact(date);
  return `${prefix} ${d} ${mon} ${y} ${t}`;
}

export function getTaskCardTimeline(
  task: Task,
): { iso: string; kind: "opened" | "closed" } | null {
  if (task.status === "closed") {
    const iso = task.closedAt?.trim() || task.updatedAt;
    return iso ? { iso, kind: "closed" } : null;
  }
  const iso = task.createdAt?.trim();
  return iso ? { iso, kind: "opened" } : null;
}
