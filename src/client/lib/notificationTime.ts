const timeFormatter12h = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isYesterday(date: Date, now: Date): boolean {
  const yesterday = new Date(now);
  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}

/** Render notification timestamps: now, N mins ago, 12h clock, yesterday, date. */
export function formatNotificationTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const deltaMs = now.getTime() - date.getTime();
  const deltaSeconds = Math.max(0, Math.floor(deltaMs / 1000));
  if (deltaSeconds < 45) return "now";
  if (deltaSeconds < 90) return "a min ago";
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes} min${deltaMinutes === 1 ? "" : "s"} ago`;
  }
  if (isSameDay(date, now)) return timeFormatter12h.format(date);
  if (isYesterday(date, now)) return "yesterday";
  if (date.getFullYear() === now.getFullYear()) {
    return shortDateFormatter.format(date);
  }
  return fullDateFormatter.format(date);
}
