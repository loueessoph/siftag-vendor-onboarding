// Generates popup_units rows (one per physical garment) for selected variants
// that have a declared quantity but no units yet. Scoped to the brands named
// on the command line. Dry run unless --write is passed.
//   node --env-file=.env.local scripts/generate-units.mjs "Hyli" "Yusun The Label" --write
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const write = args.includes("--write");
const brandNames = args.filter((a) => a !== "--write");
if (brandNames.length === 0) { console.error("Pass at least one brand name."); process.exit(1); }

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function all(table, select, mod) {
  let cq = db.from(table).select("*", { count: "exact", head: true }); if (mod) cq = mod(cq);
  const { count, error: ce } = await cq; if (ce) throw ce; const out = [];
  for (let from = 0; from < (count ?? 0); from += 1000) { let q = db.from(table).select(select); if (mod) q = mod(q); const { data, error } = await q.range(from, from + 999); if (error) throw error; out.push(...data); }
  return out;
}

const { data: event, error: evErr } = await db.from("popup_events").select("id,name").order("created_at").limit(1).single();
if (evErr) throw evErr;

const { data: brands, error: bErr } = await db.from("popup_brands").select("id,name").in("name", brandNames);
if (bErr) throw bErr;
const missing = brandNames.filter((n) => !brands.some((b) => b.name === n));
if (missing.length) { console.error("Unknown brand(s):", missing); process.exit(1); }

const products = await all("popup_products", "id,title,popup_brand_id", (q) => q.in("popup_brand_id", brands.map((b) => b.id)).eq("is_excluded", false));
const pById = new Map(products.map((p) => [p.id, p]));
// Only ticked sizes of non-excluded products get units: the same rule lib/tags.ts prints by.
const variants = (await all("popup_variants", "id,popup_product_id,size,quantity_declared,selected")).filter((v) => pById.has(v.popup_product_id) && v.selected);
const existingUnits = await all("popup_units", "popup_variant_id,unit_code");
const unitsByVariant = new Map();
for (const u of existingUnits) unitsByVariant.set(u.popup_variant_id, (unitsByVariant.get(u.popup_variant_id) || 0) + 1);
const usedCodes = new Set(existingUnits.map((u) => u.unit_code));

const newCode = () => { let c; do { c = randomBytes(4).toString("hex").toUpperCase(); } while (usedCodes.has(c)); usedCodes.add(c); return c; };

const rows = [];
const perBrand = {};
for (const v of variants) {
  const qty = Number(v.quantity_declared) || 0;
  if (qty === 0 || (unitsByVariant.get(v.id) || 0) > 0) continue;
  const p = pById.get(v.popup_product_id);
  const brandName = brands.find((b) => b.id === p.popup_brand_id).name;
  perBrand[brandName] = (perBrand[brandName] || 0) + qty;
  for (let i = 0; i < qty; i++) rows.push({ event_id: event.id, popup_variant_id: v.id, unit_code: newCode(), status: "available" });
}
console.log(`Event: ${event.name}. Units to create per brand:`, perBrand, `(total ${rows.length})`);
if (!write) { console.log("Dry run. Re-run with --write to insert."); process.exit(0); }

for (let i = 0; i < rows.length; i += 500) {
  const { error } = await db.from("popup_units").insert(rows.slice(i, i + 500));
  if (error) throw error;
}
console.log(`Inserted ${rows.length} units.`);
