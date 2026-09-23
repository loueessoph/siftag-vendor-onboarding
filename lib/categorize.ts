/**
 * Best-effort gender + category classification for the browse-all page's
 * Men (Tops/Bottoms) / Women (Tops/Bottoms/Dresses) / Accessories sort.
 * There's no explicit gender field in the vendor-onboarding schema, so this
 * infers from product_type, title, and the Shopify handle (URL slug).
 *
 * The handle matters more than it looks: confirmed real case, Plain and
 * Simple sells identical unisex-basics styles as two separate Shopify
 * products with the SAME title and product_type ("French Terry Joggers" /
 * "Sweatpants" for both) — the only place "mens"/"womens" appears at all is
 * in the handle ("organic-joggers-mens" vs "organic-joggers-womens").
 * Checking title/product_type alone silently defaulted every one of that
 * brand's men's items to Women.
 */

export type PopupGender = "women" | "men";
export type PopupCategory = "Tops" | "Bottoms" | "Dresses" | "Accessories" | "Other";

const MENS_RE = /\b(men'?s|mens|for him)\b/i;

const ACCESSORY_RE =
  /\b(access(?:o|s)ories?|necklace|bracelet|earring|jewel+ery|bag|clutch|belt|scarf|hat|beanie|cap|sunglasses|gift ?cards?)\b/i;
const DRESS_RE = /\bdress(es)?\b/i;
const BOTTOM_RE =
  /\b(trousers?|pants?|jeans?|shorts?|skirts?|joggers?|sweatpants?|leggings?|knickers?|briefs?)\b/i;
const TOP_RE =
  /\b(tops?|tee|t-?shirts?|shirts?|blouses?|sweatshirts?|hoodies?|tanks?|polos?|cardigans?|jumpers?|sweaters?|knits?|bras?|bodysuits?|camis?)\b/i;

export function classifyPopupItem(
  title: string,
  productType: string | null,
  handle?: string | null
): { gender: PopupGender; category: PopupCategory } {
  const haystack = `${productType ?? ""} ${title} ${(handle ?? "").replace(/-/g, " ")}`;
  const gender: PopupGender = MENS_RE.test(haystack) ? "men" : "women";

  let category: PopupCategory;
  if (ACCESSORY_RE.test(haystack)) category = "Accessories";
  else if (DRESS_RE.test(haystack)) category = "Dresses";
  else if (BOTTOM_RE.test(haystack)) category = "Bottoms";
  else if (TOP_RE.test(haystack)) category = "Tops";
  else category = "Other";

  // Dresses is a women's-only bucket in this taxonomy — a "men's dress"
  // match would be a data error, but fall back to Tops rather than drop it.
  if (gender === "men" && category === "Dresses") category = "Tops";

  return { gender, category };
}

/**
 * Default browse-order priority (lower = shown first). There's no real
 * popularity signal yet (no sales/view history), so this is a hand-picked
 * "generally broad-appeal casualwear first" ordering rather than actual
 * popularity — confirmed real complaint: Julie May Lingerie alone
 * contributes 50+ bra/knicker styles, which drowned out tank tops/skirts/
 * dresses at the top of the default view since everything otherwise sorted
 * in whatever order the DB happened to return rows.
 */
const STYLE_TIERS: Array<{ re: RegExp; tier: number }> = [
  { re: /\b(tanks?|camis?)\b/i, tier: 1 },
  { re: /\bskirts?\b/i, tier: 1 },
  { re: /\bdress(es)?\b/i, tier: 1 },
  { re: /\b(tee|t-?shirts?)\b/i, tier: 1 },
  { re: /\b(tops?|blouses?|shirts?)\b/i, tier: 2 },
  { re: /\b(cardigans?|jumpers?|sweaters?|knits?|sweatshirts?|hoodies?)\b/i, tier: 2 },
  { re: /\b(trousers?|pants?|jeans?|shorts?|joggers?|sweatpants?|leggings?)\b/i, tier: 2 },
  { re: /\b(bras?|knickers?|briefs?|bodysuits?|lingerie)\b/i, tier: 4 },
  {
    re: /\b(access(?:o|s)ories?|necklace|bracelet|earring|jewel+ery|bag|clutch|belt|scarf|hat|beanie|cap|sunglasses|gift ?cards?)\b/i,
    tier: 5,
  },
];

export function getStylePriority(title: string, productType: string | null): number {
  const haystack = `${productType ?? ""} ${title}`;
  for (const { re, tier } of STYLE_TIERS) {
    if (re.test(haystack)) return tier;
  }
  return 3; // unclassified — between broad-appeal casualwear and lingerie/accessories
}
