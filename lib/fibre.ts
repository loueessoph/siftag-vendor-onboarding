/**
 * Reads a fibre composition string and works out what percentage is natural.
 *
 * Clause 4.2 makes 90% natural fibre a condition of approval, so the number
 * has to be stored and checkable. Asking fourteen founders to do the sum
 * themselves invites arithmetic errors on a contractual threshold, so we read
 * it from what they type and let them correct us.
 *
 * Regenerated cellulosics — viscose, rayon, modal, lyocell, Tencel, bamboo
 * viscose — are treated as NOT natural. They start from plant matter but are
 * chemically reconstituted, and an event billed on natural fibre shouldn't
 * quietly count them. If Siftag decides otherwise, move them in one place.
 */

const NATURAL = [
  "cotton", "organic cotton", "pima", "supima", "linen", "flax", "hemp",
  "jute", "ramie", "sisal", "wool", "merino", "lambswool", "shetland",
  "cashmere", "alpaca", "mohair", "angora", "camel", "yak", "llama",
  "vicuna", "silk", "mulberry silk", "tussah", "down", "feather", "leather",
  "suede", "shearling",
];

const SYNTHETIC = [
  "polyester", "recycled polyester", "nylon", "polyamide", "acrylic",
  "elastane", "spandex", "lycra", "polypropylene", "polyurethane", "pu",
  "acetate", "triacetate", "viscose", "rayon", "modal", "lyocell", "tencel",
  "cupro", "bamboo", "metallic", "lurex", "polyethylene",
];

export type FibreReading = {
  /** Null when nothing could be parsed — the vendor then types it. */
  naturalPct: number | null;
  /** Fibre names we didn't recognise, so the vendor can be told. */
  unknown: string[];
  /** True when the percentages don't add up to 100. */
  incomplete: boolean;
};

function classify(name: string): "natural" | "synthetic" | "unknown" {
  const n = name.toLowerCase().trim();
  // Longest match first so "organic cotton" beats "cotton" and, more
  // importantly, "bamboo viscose" is never read as a natural bamboo.
  const all = [
    ...SYNTHETIC.map((f) => ({ f, kind: "synthetic" as const })),
    ...NATURAL.map((f) => ({ f, kind: "natural" as const })),
  ].sort((a, b) => b.f.length - a.f.length);

  for (const { f, kind } of all) {
    if (n.includes(f)) return kind;
  }
  return "unknown";
}

/**
 * Handles the forms people actually type: "100% linen", "70% cotton 30%
 * polyester", "80% wool, 20% nylon", "Cotton 95%, Elastane 5%".
 */
export function readComposition(input: string): FibreReading {
  const text = input.trim();
  if (!text) return { naturalPct: null, unknown: [], incomplete: false };

  // Percentage first ("70% cotton") or name first ("cotton 70%").
  const parts = [
    ...text.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%\s*([a-zA-Z][a-zA-Z\s-]*)/g),
  ].map((m) => ({ pct: Number(m[1]), name: m[2] }));

  const trailing = [
    ...text.matchAll(/([a-zA-Z][a-zA-Z\s-]*?)\s*(\d{1,3}(?:\.\d+)?)\s*%/g),
  ].map((m) => ({ pct: Number(m[2]), name: m[1] }));

  const found = parts.length >= trailing.length ? parts : trailing;
  if (found.length === 0) {
    return { naturalPct: null, unknown: [], incomplete: false };
  }

  let natural = 0;
  let total = 0;
  const unknown: string[] = [];

  for (const { pct, name } of found) {
    if (!Number.isFinite(pct)) continue;
    total += pct;
    const kind = classify(name);
    if (kind === "natural") natural += pct;
    else if (kind === "unknown") unknown.push(name.trim());
  }

  if (total === 0) return { naturalPct: null, unknown, incomplete: false };

  return {
    naturalPct: Math.round((natural / total) * 1000) / 10,
    unknown,
    // A composition that doesn't total 100 usually means something was left
    // out, which would make the natural share wrong in the vendor's favour.
    incomplete: Math.abs(total - 100) > 0.5,
  };
}

export const MINIMUM_NATURAL_PCT = 90;

export function meetsThreshold(pct: number | null): boolean {
  return pct !== null && pct >= MINIMUM_NATURAL_PCT;
}
