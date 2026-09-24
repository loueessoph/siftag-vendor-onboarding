/**
 * Strips length/fit qualifiers ("Reg", "Regular", "Long", "Short", "Petite",
 * "Tall") off a raw size label so "S Reg" and "S Long" both normalize to
 * "S" and merge into one chip — confirmed real case: Aefen London's Blythe
 * trousers have separate variant rows per leg length ("S Reg", "S Long",
 * "M Reg", "M Long", ...), which otherwise show as ten near-duplicate
 * chips instead of four (XS/S/M/L/XL) sizes.
 */
export function normalizeSizeLabel(size: string | null): string | null {
  if (!size) return size;
  const stripped = size
    .replace(/\b(reg(?:ular)?|long|short|petite|tall)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || size; // don't blank out a label that's ONLY a qualifier
}
