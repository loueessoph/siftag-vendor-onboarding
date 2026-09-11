/** The fixed dates for the event. Everything user-facing derives from here. */
export const KEY_DATES = {
  stockWindowOpens: "2026-08-18",
  productList: "2026-09-14",
  // Stock has two deadlines: UK brands ship domestically and can cut it
  // finer; international parcels clear customs, so they get the earlier
  // date on the customs side and the later one on ours.
  stockArrivalUk: "2026-09-18",
  stockArrivalInternational: "2026-09-20",
  setUp: "2026-09-24",
  tradingStart: "2026-09-25",
  tradingEnd: "2026-09-27",
  packDown: "2026-09-28",
} as const;

/** The stock deadline that applies to a given brand. */
export function stockArrivalFor(isInternational: boolean): string {
  return isInternational
    ? KEY_DATES.stockArrivalInternational
    : KEY_DATES.stockArrivalUk;
}

/** "14 September" — the form used throughout the vendor pack. */
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

/**
 * The last instant a product list may change: the end of the deadline day
 * "anywhere on earth" (UTC-12), so a brand in any time zone who submits on
 * the 14th by their own clock is in time. In London that is 12:59 on the
 * 15th.
 */
export const PRODUCT_LIST_CLOSES = new Date(
  `${KEY_DATES.productList}T23:59:59.999-12:00`
);

/**
 * Whether a brand may still change their product list. Submitting doesn't
 * close it: brands come back with a restock or a colour they forgot, and
 * until the tags are printed we would rather have the corrected list than
 * an email about it.
 */
export function listEditable(from: Date = new Date()): boolean {
  return from.getTime() <= PRODUCT_LIST_CLOSES.getTime();
}

export function isUrgent(iso: string, from: Date = new Date()): boolean {
  return daysUntil(iso, from) <= 7;
}
