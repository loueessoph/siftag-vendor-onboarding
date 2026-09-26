/**
 * Removes the ZZ Test Brand and everything that only exists because of it:
 * its stock units and their history, its rehearsal submission and
 * deliveries, its catalogue, the brand row. Real brands are untouched. It
 * refuses if any order item still points at the brand (wipe-test-orders.ts
 * first). Dry run unless --write.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolver.mjs --env-file=.env.local scripts/remove-test-brand.ts --write
 */
import { supabaseAdmin } from "../lib/supabase/server";
import { TEST_BRAND_NAME } from "../lib/test-brand";

const write = process.argv.includes("--write");
const db = supabaseAdmin();

const { data: brand } = await db.from("popup_brands").select("id, name").eq("name", TEST_BRAND_NAME).maybeSingle();
if (!brand) {
  console.log(`${TEST_BRAND_NAME} is already gone.`);
  process.exit(0);
}
const { data: products } = await db.from("popup_products").select("id").eq("popup_brand_id", brand.id);
const productIds = (products ?? []).map((p) => p.id as string);
const { data: variants } = productIds.length ? await db.from("popup_variants").select("id").in("popup_product_id", productIds) : { data: [] };
const variantIds = (variants ?? []).map((v) => v.id as string);
const { data: units } = variantIds.length ? await db.from("popup_units").select("id").in("popup_variant_id", variantIds) : { data: [] };
const unitIds = (units ?? []).map((u) => u.id as string);
const { count: orderItems } = await db.from("popup_order_items").select("id", { count: "exact", head: true }).eq("popup_brand_id", brand.id);
const { count: submissions } = await db.from("popup_submissions").select("id", { count: "exact", head: true }).eq("popup_brand_id", brand.id);
const { count: deliveries } = await db.from("popup_deliveries").select("id", { count: "exact", head: true }).eq("popup_brand_id", brand.id);

console.log(`${brand.name}: ${productIds.length} products, ${variantIds.length} variants, ${unitIds.length} units, ${submissions ?? 0} submission(s), ${deliveries ?? 0} deliveries, ${orderItems ?? 0} order items`);
if ((orderItems ?? 0) > 0) {
  console.error("Refusing: order items still point at this brand. Run wipe-test-orders.ts first.");
  process.exit(2);
}
if (!write) {
  console.log("Dry run. Re-run with --write to delete.");
  process.exit(0);
}

const step = async (label: string, q: PromiseLike<{ error: unknown }>) => {
  const { error } = await q;
  if (error) throw new Error(`${label}: ${JSON.stringify(error)}`);
  console.log(`  ${label}`);
};
if (unitIds.length) {
  await step("unit events", db.from("popup_unit_events").delete().in("popup_unit_id", unitIds));
  await step("units", db.from("popup_units").delete().in("id", unitIds));
}
await step("deliveries", db.from("popup_deliveries").delete().eq("popup_brand_id", brand.id));
await step("submissions", db.from("popup_submissions").delete().eq("popup_brand_id", brand.id));
if (productIds.length) await step("catalogue", db.from("popup_products").delete().eq("popup_brand_id", brand.id));
await step("brand", db.from("popup_brands").delete().eq("id", brand.id));
console.log(`Deleted ${brand.name}.`);
