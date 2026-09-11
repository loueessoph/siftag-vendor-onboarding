/**
 * Fibre compositions: the list vendors pick from, the parser that reads one
 * out of text, and the natural-fibre share that clause 4.2 hangs on.
 *
 * Clause 4.2 makes 90% natural fibre a condition of approval, so the number
 * has to be stored and checkable. Asking fourteen founders to do the sum
 * themselves invites arithmetic errors on a contractual threshold, so we read
 * it from the composition and let them correct us.
 *
 * Regenerated cellulosics — viscose, rayon, modal, lyocell, Tencel, SeaCell,
 * bamboo viscose — are treated as NOT natural. They start from plant matter
 * but are chemically reconstituted, and an event billed on natural fibre
 * shouldn't quietly count them. If Siftag decides otherwise, change one line
 * in `isNatural`.
 *
 * A composition is stored as text, "78% Pima Cotton, 22% Silk", so the same
 * column serves the dropdown editor, the scrape, the submission snapshot and
 * the tag printer. `formatComposition` is the only thing that writes it and
 * `parseComposition` the only thing that reads it, so the two can't drift.
 */

export type FibreKind = "natural" | "regenerated" | "synthetic";

export type Fibre = {
  /** Display name, and what gets stored. */
  name: string;
  kind: FibreKind;
  /** Lower-case words that mean this fibre in a product description. */
  aliases: string[];
};

export const FIBRES: Fibre[] = [
  // Natural
  { name: "Cotton", kind: "natural", aliases: ["cotton", "khadi", "denim", "handloom cotton", "egyptian cotton"] },
  { name: "Organic Cotton", kind: "natural", aliases: ["organic cotton"] },
  { name: "Pima Cotton", kind: "natural", aliases: ["pima", "supima"] },
  { name: "Linen", kind: "natural", aliases: ["linen", "flax"] },
  { name: "Hemp", kind: "natural", aliases: ["hemp"] },
  { name: "Ramie", kind: "natural", aliases: ["ramie"] },
  { name: "Jute", kind: "natural", aliases: ["jute"] },
  { name: "Wool", kind: "natural", aliases: ["wool", "virgin wool"] },
  { name: "Merino Wool", kind: "natural", aliases: ["merino"] },
  { name: "Lambswool", kind: "natural", aliases: ["lambswool", "lambs wool"] },
  { name: "Shetland Wool", kind: "natural", aliases: ["shetland"] },
  { name: "Cashmere", kind: "natural", aliases: ["cashmere"] },
  { name: "Alpaca", kind: "natural", aliases: ["alpaca"] },
  { name: "Mohair", kind: "natural", aliases: ["mohair"] },
  { name: "Angora", kind: "natural", aliases: ["angora"] },
  { name: "Camel Hair", kind: "natural", aliases: ["camel"] },
  { name: "Yak", kind: "natural", aliases: ["yak"] },
  { name: "Llama", kind: "natural", aliases: ["llama"] },
  { name: "Vicuña", kind: "natural", aliases: ["vicuna", "vicuña"] },
  { name: "Possum", kind: "natural", aliases: ["possum"] },
  { name: "Silk", kind: "natural", aliases: ["silk", "mulberry silk", "charmeuse", "habotai"] },
  { name: "Tussah Silk", kind: "natural", aliases: ["tussah", "tussar"] },
  { name: "Down", kind: "natural", aliases: ["down"] },
  { name: "Feather", kind: "natural", aliases: ["feather", "feathers"] },
  { name: "Leather", kind: "natural", aliases: ["leather"] },
  { name: "Suede", kind: "natural", aliases: ["suede"] },
  { name: "Shearling", kind: "natural", aliases: ["shearling", "sheepskin"] },
  { name: "Natural Rubber", kind: "natural", aliases: ["natural rubber", "rubber", "latex"] },
  // Regenerated cellulosics
  { name: "Viscose", kind: "regenerated", aliases: ["viscose", "rayon", "ecovero", "vicose"] },
  { name: "Modal", kind: "regenerated", aliases: ["modal"] },
  { name: "Lyocell", kind: "regenerated", aliases: ["lyocell", "tencel"] },
  { name: "SeaCell", kind: "regenerated", aliases: ["seacell", "seaweed fibre", "seaweed fiber", "seaweed"] },
  { name: "Cupro", kind: "regenerated", aliases: ["cupro", "bemberg"] },
  { name: "Bamboo Viscose", kind: "regenerated", aliases: ["bamboo"] },
  { name: "Acetate", kind: "regenerated", aliases: ["acetate"] },
  { name: "Triacetate", kind: "regenerated", aliases: ["triacetate"] },
  // Synthetic
  { name: "Polyester", kind: "synthetic", aliases: ["polyester", "poliester"] },
  { name: "Recycled Polyester", kind: "synthetic", aliases: ["recycled polyester", "rpet"] },
  { name: "Nylon", kind: "synthetic", aliases: ["nylon", "polyamide", "polymide"] },
  { name: "Recycled Nylon", kind: "synthetic", aliases: ["recycled nylon", "econyl", "recycled polyamide"] },
  { name: "Acrylic", kind: "synthetic", aliases: ["acrylic"] },
  { name: "Elastane", kind: "synthetic", aliases: ["elastane", "spandex", "lycra"] },
  { name: "Polypropylene", kind: "synthetic", aliases: ["polypropylene"] },
  { name: "Polyurethane", kind: "synthetic", aliases: ["polyurethane", "pu"] },
  { name: "Polyethylene", kind: "synthetic", aliases: ["polyethylene"] },
  { name: "Metallic", kind: "synthetic", aliases: ["metallic", "lurex", "metallised"] },
];

export const FIBRE_KIND_LABEL: Record<FibreKind, string> = {
  natural: "Natural",
  regenerated: "Regenerated (viscose, lyocell and similar)",
  synthetic: "Synthetic",
};

function isNatural(fibre: Fibre): boolean {
  return fibre.kind === "natural";
}

const BY_NAME = new Map(FIBRES.map((f) => [f.name.toLowerCase(), f]));

/** Every alias with its fibre, as boundary-anchored patterns. */
const ALIAS_PATTERNS: { fibre: Fibre; re: RegExp }[] = FIBRES.flatMap((fibre) =>
  [...fibre.aliases, fibre.name.toLowerCase()].map((alias) => ({
    fibre,
    re: new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
  }))
);

export function fibreByName(name: string): Fibre | null {
  return BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

/**
 * The fibre named earliest in a snippet of text. Earliest rather than longest
 * so "Pure Silk Body Fabric: Silk-Cotton" reads as silk; ties at the same
 * position go to the longer alias so "organic cotton" beats "cotton".
 */
function fibreIn(
  snippet: string
): { fibre: Fibre; index: number; length: number } | null {
  let best: { fibre: Fibre; index: number; length: number } | null = null;
  for (const { fibre, re } of ALIAS_PATTERNS) {
    const m = re.exec(snippet);
    if (!m) continue;
    if (
      !best ||
      m.index < best.index ||
      (m.index === best.index && m[0].length > best.length)
    ) {
      best = { fibre, index: m.index, length: m[0].length };
    }
  }
  return best;
}

/* Parts ---------------------------------------------------------------------- */

export type CompositionPart = {
  /** Canonical name where recognised, otherwise whatever the text said. */
  name: string;
  pct: number;
  fibre: Fibre | null;
};

type Found = CompositionPart & { index: number };

/** How far after (or before) a percentage a fibre name may sit. */
const WINDOW = 48;

/**
 * A percentage that describes a part of the garment other than its main
 * fabric. "Lined in 100% cotton" and "Lining: 100% polyester" both say
 * nothing about the shell, and counting them is the mistake the marketplace
 * scrapers were hardened against. Checked in the words leading up to the
 * percentage, back to the start of the sentence.
 */
const SECONDARY_BEFORE =
  /\b(lining|lined|inner|inside|pocket(?:ing)?|pocket bags?|trims?|trimming|filling|padding|coating|binding|gusset|contrast|embroidery|labels?|elastic(?: band)?|waist ?band|thread|drawcord|drawstring)\b/i;

/** Every word that labels a part of a garment, main or secondary. */
const PART_LABELS =
  "body|shell|main(?: fabric)?|fabric|composition|outer|self|trim(?:ming)?s?|lining|lined|lace|cups?|gusset|pocket(?: bags?)?|inner|inside|contrast|rib|collar|cuffs?|sleeves?|skirt|bodice|panel|mesh|binding|elastic(?: band)?|waist ?band|thread|labels?|yarn|filling|padding|drawcord|drawstring|embroidery";
const LABEL_RE = new RegExp(`\\b(${PART_LABELS})\\b`, "gi");

/**
 * Which part of the garment a percentage describes: the nearest label
 * before it in the same clause. "Body: Lining 100% Cotton, Shell 100%
 * Viscose" labels the cotton as lining and the viscose as shell.
 */
function partLabel(clause: string): string | null {
  let last: string | null = null;
  for (const m of clause.matchAll(LABEL_RE)) last = m[1];
  return last;
}

/** The same, when the qualifier follows the fibre: "100% silk trimming". */
const SECONDARY_AFTER = /^\s*(lining|trims?|trimming|pocket(?:ing)?|binding|gusset|embroidery|label)\b/i;

/** "20% off cotton tees" is a promotion, not a composition. */
const PROMOTION_AFTER = /^\s*(off|discount|sale|cheaper|more|less|extra)\b/i;

/**
 * Finds every "N%" and pairs it with a fibre. Descriptions write it both ways
 * round, "78% cotton" and "Cotton 78%", so both readings are tried across the
 * whole text and the one that names more fibres wins.
 */
function findParts(text: string): Found[] {
  const matches = [...text.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)].map((m) => ({
    pct: Number(m[1]),
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
  if (matches.length === 0) return [];

  const after = (i: number) => {
    const next = matches[i + 1]?.start ?? text.length;
    return text.slice(matches[i].end, Math.min(next, matches[i].end + WINDOW));
  };
  const before = (i: number) => {
    const prev = matches[i - 1]?.end ?? 0;
    const snippet = text.slice(
      Math.max(prev, matches[i].start - WINDOW),
      matches[i].start
    );
    // Back only to the start of the sentence, so "The lining is soft. 100%
    // cotton." isn't read as a lining.
    return snippet.slice(snippet.search(/[^.;!?\n]*$/));
  };

  // The whole clause a percentage sits in, back to the sentence start: the
  // label ("Lining:", "Elastic:") applies to every part after it, not just
  // the first, so this looks past earlier percentages in the same clause.
  const clause = (i: number) => {
    const snippet = text.slice(Math.max(0, matches[i].start - 160), matches[i].start);
    return snippet.slice(snippet.search(/[^.;!?\n]*$/));
  };

  const read = (pctFirst: boolean): Found[] =>
    matches
      .map((m, i) => {
        if (m.pct <= 0 || m.pct > 100) return null;
        const lead = before(i);
        const trail = after(i);
        if (PROMOTION_AFTER.test(trail)) return null;
        const label = partLabel(clause(i));
        if (label && SECONDARY_BEFORE.test(label)) return null;

        const snippet = pctFirst ? trail : lead;
        const hit = fibreIn(snippet);
        if (hit && pctFirst && SECONDARY_AFTER.test(snippet.slice(hit.index + hit.length))) {
          return null;
        }
        const words = snippet
          .replace(/[^a-zA-Z\s-]/g, " ")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const name =
          hit?.fibre.name ??
          (pctFirst ? words.slice(0, 2) : words.slice(-2)).join(" ");
        return { name, pct: m.pct, fibre: hit?.fibre ?? null, index: i };
      })
      .filter((p): p is Found => p !== null);

  const a = read(true);
  const b = read(false);
  const score = (parts: Found[]) => parts.filter((p) => p.fibre).length;
  return score(b) > score(a) ? b : a;
}

/**
 * Reads a stored or typed composition into rows. Unrecognised fibres come
 * back with `fibre: null` and their name as written, so the editor can show
 * them and the vendor can be told.
 */
export function parseComposition(text: string | null | undefined): CompositionPart[] {
  if (!text?.trim()) return [];
  return findParts(text)
    .filter((p) => p.name)
    .map(({ name, pct, fibre }) => ({ name, pct, fibre }));
}

/** "78% Pima Cotton, 22% Silk". Largest share first; the stored form. */
export function formatComposition(parts: CompositionPart[]): string {
  return [...parts]
    .filter((p) => p.name.trim() && p.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .map((p) => `${trimPct(p.pct)}% ${p.name.trim()}`)
    .join(", ");
}

function trimPct(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

/* From prose ----------------------------------------------------------------- */

/** Words that mean the surrounding text is about the fabric rather than a tagline. */
const COMPOSITION_CONTEXT =
  /\b(fabric|material|composition|content|fibres?|fibers?|yarn|made\s+(?:from|of|with)|crafted\s+(?:from|of|with|in)|woven|handwoven|knit(?:ted)?|spun)\b/gi;

/**
 * Proof that a named fibre is NOT the whole garment: "a hint of silk",
 * "cotton blend", "wool mix". Inferring 100% from any of these is the
 * failure a natural-fibre event exists to prevent.
 */
const NOT_THE_WHOLE_STORY =
  /\b(?:hint|touch|trace|splash|dash|pop|whisper)\s+of\b|\bblends?\b|\bblended\b|\bmix(?:ed)?\b|\bcombin(?:ation|ed)\b/i;

/** Never the whole garment on their own; a few percent for stretch or shine. */
const NEVER_SOLE = new Set(["Elastane", "Polyurethane", "Metallic"]);

/**
 * When a description names exactly one fibre next to a fabric word and never
 * gives a percentage ("handwoven khadi cotton", "crafted from viscose satin"),
 * that fibre is taken as 100%. Two fibres, a blend word, or a fibre that is
 * never sole, and it stays empty rather than guess.
 */
function inferSingleFibre(text: string): string | null {
  const windows: string[] = [];
  for (const m of text.matchAll(COMPOSITION_CONTEXT)) {
    const at = m.index ?? 0;
    windows.push(text.slice(Math.max(0, at - 150), at + m[0].length + 150));
  }
  if (windows.length === 0) return null;
  const joined = windows.join(" ");
  if (NOT_THE_WHOLE_STORY.test(joined)) return null;

  const found = new Set<string>();
  for (const { fibre, re } of ALIAS_PATTERNS) {
    if (NEVER_SOLE.has(fibre.name)) continue;
    if (re.test(joined)) found.add(fibre.name);
  }
  // "Organic cotton" also matches "cotton"; one fibre family is one fibre.
  const names = [...found];
  const distinct = names.filter(
    (n) => !names.some((o) => o !== n && o.toLowerCase().endsWith(n.toLowerCase()))
  );
  return distinct.length === 1 ? `100% ${distinct[0]}` : null;
}

/**
 * Pulls a composition out of a product description, for seeding the vendor's
 * form. Descriptions also say "15% off" and "lined in 100% cotton", so only
 * percentages followed by a fibre count, secondary parts of the garment are
 * skipped, and a run of parts is cut wherever the total would pass 100 — a
 * dress listed as "Bodice: 100% silk, Skirt: 100% silk organza" is two
 * statements, not one. Of the runs that add to 100, the one naming most
 * fibres wins: a blend statement is more specific than a "100% silk" trim
 * mentioned earlier. Returns null when nothing convincing is there, so the
 * vendor sees an empty form rather than a wrong answer.
 */
export function extractComposition(prose: string): string | null {
  const text = prose
    .replace(/<br\s*\/?>|<\/(p|li|div|h[1-6]|tr)>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ");

  const parts = findParts(text).filter((p) => p.fibre);
  if (parts.length === 0) return inferSingleFibre(text);

  const groups: Found[][] = [];
  let current: Found[] = [];
  let sum = 0;
  for (const part of parts) {
    if (sum + part.pct > 100.5 && current.length > 0) {
      groups.push(current);
      current = [];
      sum = 0;
    }
    current.push(part);
    sum += part.pct;
  }
  if (current.length > 0) groups.push(current);

  const total = (g: Found[]) => g.reduce((s, p) => s + p.pct, 0);
  const complete = groups.filter((g) => Math.abs(total(g) - 100) <= 0.5);
  const pool = complete.length > 0 ? complete : groups;
  const best = pool.reduce((a, b) =>
    b.length > a.length || (b.length === a.length && total(b) > total(a)) ? b : a
  );

  // The same fibre twice in one run ("50% wool body, 50% wool sleeves") is
  // one fibre.
  const merged = new Map<string, CompositionPart>();
  for (const p of best) {
    const prev = merged.get(p.name);
    merged.set(p.name, prev ? { ...prev, pct: prev.pct + p.pct } : p);
  }
  return formatComposition([...merged.values()]) || null;
}

/* Labelled parts ------------------------------------------------------------- */

/**
 * A description that itemises the garment, "Body: 100% Cotton. Trim: 100%
 * Cotton", says more than one composition line can hold. The body is what
 * the composition field gets (see `extractComposition`); this returns the
 * whole statement, "Body: 100% Cotton · Trim: 100% Cotton", so it can be
 * kept alongside and nothing the brand published is lost. Null unless at
 * least two parts are named.
 */
export function fabricDetails(prose: string): string | null {
  const text = prose
    .replace(/<br\s*\/?>|<\/(p|li|div|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/[ \t]+/g, " ");

  // Every "Label:" in the text; each value runs to the next label, or to
  // the end of the line or sentence, so one part can't swallow the next.
  const labelRe = new RegExp(`\\b(${PART_LABELS})\\s*[:\\-–]\\s*`, "gi");
  const hits = [...text.matchAll(labelRe)];
  const parts: string[] = [];
  let ambiguous = false;

  hits.forEach((hit, i) => {
    const from = (hit.index ?? 0) + hit[0].length;
    const to = hits[i + 1]?.index ?? text.length;
    const raw = text.slice(from, Math.min(to, from + 160));
    const value = raw
      .split(/[\n;]|\.(?=\s|$)/)[0]
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[,+\s]+$/, "");
    if (!/\d{1,3}\s*%/.test(value) || !fibreIn(value)) return;

    // A part made of anything other than natural fibre, or naming a fibre we
    // don't recognise, is worth showing. Cotton body with cotton trim isn't.
    for (const part of parseComposition(value)) {
      if (!part.fibre || !isNatural(part.fibre)) ambiguous = true;
    }
    const label = hit[1].trim();
    const entry = `${label.charAt(0).toUpperCase()}${label.slice(1).toLowerCase()}: ${value}`;
    if (!parts.includes(entry)) parts.push(entry);
  });

  return parts.length >= 2 && ambiguous ? parts.join(" · ") : null;
}

/* Notes ---------------------------------------------------------------------- */

export const FABRIC_NOTE_PREFIX = "Fabric content from your website: ";

/**
 * The item's notes hold two things in one column: the itemised fabric
 * statement the scrape found (read-only, ours) and whatever the brand
 * writes (theirs). Kept as one string so the snapshot and admin see both,
 * split here so the editor can show the first as fixed text.
 */
export function splitNotes(notes: string | null | undefined): {
  fabric: string | null;
  own: string;
} {
  const text = notes ?? "";
  if (!text.startsWith(FABRIC_NOTE_PREFIX)) return { fabric: null, own: text };
  const end = text.indexOf("\n\n");
  if (end === -1) return { fabric: text.slice(FABRIC_NOTE_PREFIX.length).trim(), own: "" };
  return {
    fabric: text.slice(FABRIC_NOTE_PREFIX.length, end).trim(),
    own: text.slice(end + 2),
  };
}

export function joinNotes(fabric: string | null, own: string): string {
  const theirs = own.replace(/^\s+/, "");
  if (!fabric) return theirs;
  return theirs ? `${FABRIC_NOTE_PREFIX}${fabric}\n\n${theirs}` : `${FABRIC_NOTE_PREFIX}${fabric}`;
}

/* Natural share -------------------------------------------------------------- */

export type FibreReading = {
  /** Null when nothing could be parsed — the vendor then fills it in. */
  naturalPct: number | null;
  /** Fibre names we didn't recognise, so the vendor can be told. */
  unknown: string[];
  /** True when the percentages don't add up to 100. */
  incomplete: boolean;
};

/**
 * Handles the forms people actually type: "100% linen", "70% cotton 30%
 * polyester", "80% wool, 20% nylon", "Cotton 95%, Elastane 5%".
 */
export function readComposition(input: string): FibreReading {
  const parts = parseComposition(input);
  if (parts.length === 0) {
    return { naturalPct: null, unknown: [], incomplete: false };
  }

  let natural = 0;
  let total = 0;
  const unknown: string[] = [];
  for (const part of parts) {
    total += part.pct;
    if (part.fibre) {
      if (isNatural(part.fibre)) natural += part.pct;
    } else if (part.name) {
      unknown.push(part.name);
    }
  }

  if (total === 0) return { naturalPct: null, unknown, incomplete: false };

  // Against 100, not against what was listed: "20% organic cotton" on its
  // own is 20% natural and 80% unknown, not 100% natural. Where the parts
  // overshoot 100 the ratio is the only sensible reading.
  return {
    naturalPct: Math.round((natural / Math.max(total, 100)) * 1000) / 10,
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
