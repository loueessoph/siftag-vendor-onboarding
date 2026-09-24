// Removes a brand that has dropped out of the pop-up, with its scraped
// catalogue. Refuses if anything that matters hangs off it (stock units,
// orders, a submission, deliveries, settlements) so a live brand can't be
// deleted by accident. Dry run unless --write is passed.
//   node --env-file=.env.local scripts/remove-brand.mjs zubek --write
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const [slug, flag] = process.argv.slice(2);
const write = flag === "--write";
if (!slug) { console.error("Usage: remove-brand.mjs <slug> [--write]"); process.exit(1); }

const { data: brand, error } = await db.from("popup_brands").select("id, name, agreement_status, fee_paid_at, submission_status").eq("slug", slug).maybeSingle();
if (error) throw error;
if (!brand) { console.error(`No brand with slug "${slug}"`); process.exit(1); }

const count = async (table, filter) => {
  const { count, error } = await filter(db.from(table).select("id", { count: "exact", head: true }));
  if (error) throw error; return count ?? 0;
};
const products = await count("popup_products", (q) => q.eq("popup_brand_id", brand.id));
const { data: productRows } = await db.from("popup_products").select("id").eq("popup_brand_id", brand.id);
const productIds = (productRows ?? []).map((p) => p.id);
// Hundreds of ids in one `in()` overflow the request line, so work in chunks.
const chunked = async (ids, fn) => { let total = 0; for (let i = 0; i < ids.length; i += 40) total += await fn(ids.slice(i, i + 40)); return total; };
const variantIds = [];
await chunked(productIds, async (ids) => { const { data, error } = await db.from("popup_variants").select("id").in("popup_product_id", ids); if (error) throw error; variantIds.push(...data.map((v) => v.id)); return 0; });
const blockers = {
  units: await chunked(variantIds, (ids) => count("popup_units", (q) => q.in("popup_variant_id", ids))),
  orderItems: await count("popup_order_items", (q) => q.eq("popup_brand_id", brand.id)),
  submissions: await count("popup_submissions", (q) => q.eq("popup_brand_id", brand.id)),
  deliveries: await count("popup_deliveries", (q) => q.eq("popup_brand_id", brand.id)),
  settlements: await count("popup_settlements", (q) => q.eq("popup_brand_id", brand.id)),
};
console.log(`${brand.name}: agreement ${brand.agreement_status}, fee ${brand.fee_paid_at ? "paid" : "not paid"}, list ${brand.submission_status}`);
console.log(`  would delete ${products} products and ${variantIds.length} variants`);
console.log(`  blockers:`, blockers);
if (Object.values(blockers).some((n) => n > 0) || brand.fee_paid_at) {
  console.error("Refusing: this brand has stock, orders, a submission, deliveries, a settlement or a paid fee. Remove those first, on purpose.");
  process.exit(2);
}
if (!write) { console.log("Dry run. Re-run with --write to delete."); process.exit(0); }

if (productIds.length) {
  const { error: pe } = await db.from("popup_products").delete().eq("popup_brand_id", brand.id);
  if (pe) throw pe;
}
const { error: be } = await db.from("popup_brands").delete().eq("id", brand.id);
if (be) throw be;
console.log(`Deleted ${brand.name}.`);
