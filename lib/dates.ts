/** The fixed dates for the event. Everything user-facing derives from here. */
export const KEY_DATES = {
  stockWindowOpens: "2026-08-18",
  productList: "2026-09-14",
  // The product list was extended after the 14th passed. `productList` stays
  // as the date in the signed agreement and the original emails; this is the
  // date brands are now told, and the day the portal actually closes.
  productListExtended: "2026-09-16",
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
 * The last instant a product list may change: 23:59:59 BST (UTC+1) on the
 * extended deadline day. The original close was the end of the 14th
 * "anywhere on earth" (UTC-12), 12:59 on the 15th in London; the extension
 * is a fixed London time instead, so it reads the same to us and to brands.
 */
export const PRODUCT_LIST_CLOSES = new Date(
  `${KEY_DATES.productListExtended}T23:59:59.999+01:00`
);

/**
 * Brands whose list we reopened after the close, keyed by slug, with the
 * London day it shuts again for them (inclusive, same 23:59:59 rule as the
 * main close). Everyone else stays closed: this is a favour granted one
 * brand at a time, not a second extension, so it lives here next to the
 * dates rather than in a column anyone could flip.
 */
export const LIST_REOPENED_UNTIL: Record<string, string> = {
  // Jude needed to correct sizes after submitting on the last night.
  hyli: "2026-09-23",
};

type ListBrand = { slug: string };

/** The day a brand's product list closes: the event date, or their reopening. */
export function listClosesFor(brand: ListBrand): string {
  return LIST_REOPENED_UNTIL[brand.slug] ?? KEY_DATES.productListExtended;
}

function listClosesAt(brand: ListBrand | undefined): Date {
  const reopened = brand && LIST_REOPENED_UNTIL[brand.slug];
  return reopened
    ? new Date(`${reopened}T23:59:59.999+01:00`)
    : PRODUCT_LIST_CLOSES;
}

/**
 * Whether a brand may still change their product list. Submitting doesn't
 * close it: brands come back with a restock or a colour they forgot, and
 * until the tags are printed we would rather have the corrected list than
 * an email about it. A brand we reopened for gets their own later close.
 */
export function listEditable(
  brand?: ListBrand,
  from: Date = new Date()
): boolean {
  return from.getTime() <= listClosesAt(brand).getTime();
}

export function isUrgent(iso: string, from: Date = new Date()): boolean {
  return daysUntil(iso, from) <= 7;
}
