/**
 * Tidies a raw size label without losing what it says. Length and fit
 * qualifiers are kept and spelt out ("S Reg" -> "S Regular", "s long" ->
 * "S Long"): Aefen London's Blythe trousers come in separate rows per leg
 * length, and merging them into one "S" chip left the vendor with two
 * tags reading "S" and no way to tell which was which. A label that is
 * only a qualifier is left alone.
 */
const QUALIFIERS: Record<string, string> = {
  reg: "Regular",
  regular: "Regular",
  long: "Long",
  short: "Short",
  petite: "Petite",
  tall: "Tall",
};

/** The order lengths read in, regular in the middle. */
const QUALIFIER_RANK = ["Petite", "Short", "Regular", "Long", "Tall"];

export function normalizeSizeLabel(size: string | null): string | null {
  if (!size) return size;
  const words = size.trim().split(/\s+/);
  const base: string[] = [];
  const quals: string[] = [];
  for (const w of words) {
    const q = QUALIFIERS[w.toLowerCase()];
    if (q) quals.push(q);
    else base.push(w);
  }
  if (base.length === 0) return size.trim();
  // Letter sizes read as capitals ("xs" -> "XS"); anything else keeps its own casing.
  const joined = base.join(" ");
  const baseLabel = /^(xxs|xs|s|m|l|xl|xxl|3xl|4xl)$/i.test(joined) ? joined.toUpperCase() : joined;
  return quals.length ? `${baseLabel} ${quals.join(" ")}` : baseLabel;
}

/** "S Long" -> "S": what the size is before any length or fit. */
export function sizeBase(size: string | null): string {
  if (!size) return "";
  return size
    .split(/\s+/)
    .filter((w) => !QUALIFIERS[w.toLowerCase()])
    .join(" ")
    .toUpperCase();
}

/** Where a label's qualifier sits among lengths; unqualified counts as regular. */
export function sizeQualifierRank(size: string | null): number {
  if (!size) return QUALIFIER_RANK.indexOf("Regular");
  for (const w of size.split(/\s+/)) {
    const q = QUALIFIERS[w.toLowerCase()];
    if (q) return QUALIFIER_RANK.indexOf(q);
  }
  return QUALIFIER_RANK.indexOf("Regular");
}
