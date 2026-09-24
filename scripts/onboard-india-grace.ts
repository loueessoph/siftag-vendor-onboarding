/**
 * One-off: brings India Grace London's list up to date from her spreadsheet.
 *
 *   1. Re-scrapes indiagracelondon.com (fresh titles, every product photo).
 *   2. Adds the 15 Draft items from the spreadsheet as hand-added products.
 *      All but one stay unticked with no stock, so they never reach the
 *      storefront. The Isolde Wrap Skirt in Black Marl has arrived, so it
 *      is ticked and stocked like the rest.
 *   3. Ticks every size of every Active product and declares 1 of each.
 *
 * Dry run unless --write is passed. Safe to re-run: existing hand-added
 * items are matched by title + colour, and quantities already set are kept.
 * Follow with:  node --env-file=.env.local scripts/generate-units.mjs "India Grace London" --write
 */
import { supabaseAdmin } from "../lib/supabase/server";
import { fetchCatalogue } from "../lib/catalogue";
import { ingestCatalogue } from "../lib/ingest";
import { addCustomItem } from "../lib/custom-items";

const WRITE = process.argv.includes("--write");
const BRAND_NAME = "India Grace London";
const GARMENT_SIZES = ["XS", "S", "M", "L", "XL"];
const KNIT = "90% Wool, 10% Cashmere";

type Draft = { title: string; colour: string; type: string; price: number | null; sizes: string[]; fibre: string | null; arrived?: boolean };
const DRAFTS: Draft[] = [
  { title: "Isolde Wrap Skirt", colour: "Black Marl", type: "Skirts", price: 100, sizes: GARMENT_SIZES, fibre: null, arrived: true },
  { title: "Aurelia Cardigan", colour: "Black Marl", type: "Knitwear", price: 140, sizes: GARMENT_SIZES, fibre: KNIT },
  { title: "Cicily Dress", colour: "Black", type: "Dresses", price: 180, sizes: GARMENT_SIZES, fibre: null },
  { title: "Elodie Crew Neck", colour: "Pancotta", type: "Knitwear", price: 90, sizes: GARMENT_SIZES, fibre: KNIT },
  { title: "Elodie Crew Neck", colour: "Chincilla", type: "Knitwear", price: 90, sizes: GARMENT_SIZES, fibre: KNIT },
  { title: "Isabella Skirt", colour: "Dark Brown", type: "Skirts", price: 90, sizes: GARMENT_SIZES, fibre: null },
  { title: "Isabella Top", colour: "Dark Brown", type: "Tops", price: 80, sizes: GARMENT_SIZES, fibre: null },
  { title: "Isolde Top", colour: "Black", type: "Tops", price: 80, sizes: GARMENT_SIZES, fibre: "100% Viscose" },
  { title: "Lucia Scarf", colour: "Baby Blue", type: "Accessories", price: 65, sizes: [], fibre: KNIT },
  { title: "Lucia Scarf", colour: "Pancotta", type: "Accessories", price: 65, sizes: [], fibre: KNIT },
  { title: "Lucia Scarf", colour: "Chincilla", type: "Accessories", price: 65, sizes: [], fibre: KNIT },
  { title: "Nina Roll Neck", colour: "Baby Blue", type: "Knitwear", price: 125, sizes: GARMENT_SIZES, fibre: KNIT },
  { title: "Nina Roll Neck", colour: "Black Marl", type: "Knitwear", price: 125, sizes: GARMENT_SIZES, fibre: KNIT },
  { title: "Lucille Blouse", colour: "White", type: "Tops", price: null, sizes: GARMENT_SIZES, fibre: null },
  { title: "Clementine Blouse", colour: "White", type: "Tops", price: null, sizes: GARMENT_SIZES, fibre: null },
  { title: "Isadora Blouse", colour: "White", type: "Tops", price: null, sizes: GARMENT_SIZES, fibre: null },
];

const db = supabaseAdmin();
const { data: brand, error: brandError } = await db
  .from("popup_brands")
  .select("id, name, brand_code, shopify_domain, submission_status")
  .eq("name", BRAND_NAME)
  .single();
if (brandError) throw brandError;
console.log(`${brand.name} (${brand.brand_code}) at ${brand.shopify_domain}, submission ${brand.submission_status}. ${WRITE ? "WRITING" : "Dry run"}.`);

// 1. Re-scrape ---------------------------------------------------------------
if (WRITE) {
  const r = await ingestCatalogue(brand.id, brand.brand_code, brand.shopify_domain);
  console.log("Re-scrape:", r);
} else {
  const scraped = await fetchCatalogue(brand.shopify_domain);
  const { data: existing } = await db.from("popup_products").select("shopify_product_id, title, image_urls").eq("popup_brand_id", brand.id);
  const byId = new Map((existing ?? []).map((p) => [p.shopify_product_id, p]));
  for (const p of scraped) {
    const cur = byId.get(p.shopifyProductId);
    const rename = cur && cur.title !== p.title ? ` (title "${cur.title}" -> "${p.title}")` : "";
    console.log(`  scrape: ${p.title} [${p.variants[0]?.colour ?? "-"}] photos ${cur?.image_urls?.length ?? 0} -> ${p.imageUrls.length}${rename}${cur ? "" : " NEW"}`);
  }
}

// 2. Draft items -------------------------------------------------------------
const { data: customs } = await db
  .from("popup_products")
  .select("id, title, popup_variants(colour)")
  .eq("popup_brand_id", brand.id)
  .like("shopify_product_id", "vendor:%");
const same = (a: string | null | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
const findCustom = (d: Draft) =>
  (customs ?? []).find((c) => same(c.title, d.title) && (c.popup_variants as { colour: string | null }[]).some((v) => same(v.colour, d.colour)));

for (const d of DRAFTS) {
  const existing = findCustom(d);
  const label = `${d.title} / ${d.colour}${d.arrived ? " (arrived)" : " (hidden)"}`;
  if (existing) { console.log(`  draft: exists  ${label}`); continue; }
  console.log(`  draft: ${WRITE ? "adding" : "would add"} ${label} £${d.price ?? "TBC"} sizes=${d.sizes.join(",") || "one size"}`);
  if (!WRITE) continue;
  const productId = await addCustomItem(brand.id, brand.brand_code, {
    title: d.title,
    colour: d.colour,
    imageUrl: null,
    sizes: d.sizes,
    popupPrice: d.price,
    fibreComposition: d.fibre,
  });
  await db.from("popup_products").update({ product_type: d.type }).eq("id", productId);
  if (!d.arrived) await db.from("popup_variants").update({ selected: false }).eq("popup_product_id", productId);
}

// 3. Tick + declare 1 of every size on Active items (and the arrived skirt) --
const hiddenTitles = new Set(DRAFTS.filter((d) => !d.arrived).map((d) => `${d.title}|${d.colour}`.toLowerCase()));
const { data: products, error: productsError } = await db
  .from("popup_products")
  .select("id, title, is_excluded, popup_variants(id, size, colour, selected, quantity_declared)")
  .eq("popup_brand_id", brand.id);
if (productsError) throw productsError;

let toTick = 0, toDeclare = 0, already = 0;
const variantIds: string[] = [];
for (const p of products ?? []) {
  if (p.is_excluded) continue;
  for (const v of p.popup_variants as { id: string; colour: string | null; selected: boolean; quantity_declared: number | null }[]) {
    if (hiddenTitles.has(`${p.title}|${v.colour ?? ""}`.toLowerCase())) continue;
    if (v.selected && v.quantity_declared) { already++; continue; }
    if (!v.selected) toTick++;
    if (!v.quantity_declared) toDeclare++;
    variantIds.push(v.id);
  }
}
console.log(`  stock: ${variantIds.length} size rows to update (${toTick} to tick, ${toDeclare} to set qty=1, ${already} already done)`);
if (WRITE && variantIds.length) {
  for (let i = 0; i < variantIds.length; i += 200) {
    const { error } = await db.from("popup_variants").update({ selected: true, quantity_declared: 1 }).in("id", variantIds.slice(i, i + 200));
    if (error) throw error;
  }
  console.log("  stock: done. Now run generate-units.mjs for the brand.");
}
