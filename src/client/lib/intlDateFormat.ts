/**
 * Cached `Intl.DateTimeFormat` instances for locale-aware dates (Web Interface Guidelines;
 * avoids allocating formatters on hot paths like filter chips and task UI).
 */
const dateMedium = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const dateTimeMediumShort = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const monthDay = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const monthDayYear = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatDateMedium(date: Date): string {
  return dateMedium.format(date);
}

export function formatDateTimeMediumShort(date: Date): string {
  return dateTimeMediumShort.format(date);
}

export function formatMonthDayShort(date: Date): string {
  return monthDay.format(date);
}

/** Month + day; adds year when the date is not in the current calendar year. */
export function formatMonthDayShortMaybeYear(date: Date): string {
  const now = new Date();
  if (date.getFullYear() !== now.getFullYear()) {
    return monthDayYear.format(date);
  }
  return monthDay.format(date);
}
