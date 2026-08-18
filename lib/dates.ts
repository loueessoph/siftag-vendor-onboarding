/** The fixed dates for the event. Everything user-facing derives from here. */
export const KEY_DATES = {
  stockWindowOpens: "2026-08-18",
  productList: "2026-09-04",
  stockArrival: "2026-09-10",
  setUp: "2026-09-24",
  tradingStart: "2026-09-25",
  tradingEnd: "2026-09-27",
  packDown: "2026-09-28",
} as const;

/** "4 September" — the form used throughout the vendor pack. */
export function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** Whole days from today to `iso`. Negative once the date has passed. */
export function daysUntil(iso: string, from: Date = new Date()): number {
  const target = Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10))
  );
  const today = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate()
  );
  return Math.round((target - today) / 86_400_000);
}

/**
 * The urgency line above a deadline. A brand on their fourth visit in late
 * August should feel a different temperature from one who signed in June.
 */
export function deadlineLabel(iso: string, from: Date = new Date()): string {
  const days = daysUntil(iso, from);
  if (days < 0) return `Overdue: was due ${formatDate(iso)}`;
  if (days === 0) return `Due today, ${formatDate(iso)}`;
  if (days === 1) return `Due tomorrow, ${formatDate(iso)}`;
  if (days <= 14) return `${days} days left · ${formatDate(iso)}`;
  return `Due ${formatDate(iso)}`;
}

export function isUrgent(iso: string, from: Date = new Date()): boolean {
  return daysUntil(iso, from) <= 7;
}
