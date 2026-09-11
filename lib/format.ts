/** "£115.90": always two decimals, because it's money. Null shows as a dash. */
export function money(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(Number(amount))) return "–";
  return `£${Number(amount).toFixed(2)}`;
}

/** "1 item", "12 items". Used anywhere a count is shown to a vendor. */
export function plural(n: number, noun: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? noun : pluralForm ?? `${noun}s`}`;
}
