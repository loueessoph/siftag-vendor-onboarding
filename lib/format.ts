/** "1 item", "12 items". Used anywhere a count is shown to a vendor. */
export function plural(n: number, noun: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? noun : pluralForm ?? `${noun}s`}`;
}
