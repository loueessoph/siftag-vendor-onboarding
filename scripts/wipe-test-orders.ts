/**
 * Removes the rehearsal orders: every order whose items are all ZZ Test
 * Brand pieces (and pending/cancelled orders with no items whose hold was on
 * test pieces). Their units go back to available. Real brands are never
 * touched. Dry run unless --write.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolver.mjs --env-file=.env.local scripts/wipe-test-orders.ts --write
 */
import { supabaseAdmin } from "../lib/supabase/server";
import { TEST_BRAND_NAME } from "../lib/test-brand";

const write = process.argv.includes("--write");
const db = supabaseAdmin();

const { data: brand } = await db.from("popup_brands").select("id").eq("name", TEST_BRAND_NAME).single();
if (!brand) throw new Error("test brand not found");
const { data: products } = await db.from("popup_products").select("id").eq("popup_brand_id", brand.id);
const { data: variants } = await db.from("popup_variants").select("id").in("popup_product_id", (products ?? []).map((p) => p.id));
const { data: testUnits } = await db.from("popup_units").select("id, unit_code, hold_id, status").in("popup_variant_id", (variants ?? []).map((v) => v.id));
const testUnitIds = new Set((testUnits ?? []).map((u) => u.id as string));

const { data: orders } = await db.from("popup_orders").select("id, collect_code, status, source, hold_id, subtotal_gbp");
const { data: items } = await db.from("popup_order_items").select("order_id, popup_unit_id");
const itemsByOrder = new Map<string, string[]>();
for (const it of items ?? []) itemsByOrder.set(it.order_id, [...(itemsByOrder.get(it.order_id) ?? []), it.popup_unit_id]);

// Holds on test units, for orders that never got items (pending/cancelled).
const testHoldIds = new Set((testUnits ?? []).map((u) => u.hold_id as string | null).filter(Boolean) as string[]);
const { data: holdUnits } = await db.from("popup_units").select("hold_id").in("id", [...testUnitIds]);
for (const h of holdUnits ?? []) if (h.hold_id) testHoldIds.add(h.hold_id);

const victims = (orders ?? []).filter((o) => {
  const unitIds = itemsByOrder.get(o.id) ?? [];
  if (unitIds.length > 0) return unitIds.every((id) => testUnitIds.has(id));
  return o.hold_id ? testHoldIds.has(o.hold_id) : false;
});

console.log(`${victims.length} test order(s):`);
for (const o of victims) console.log(`  ${o.collect_code}  ${o.status}  ${o.source}  £${Number(o.subtotal_gbp ?? 0).toFixed(2)}  items=${(itemsByOrder.get(o.id) ?? []).length}`);
if (!write) {
  console.log("Dry run. Re-run with --write to delete them.");
  process.exit(0);
}

const ids = victims.map((o) => o.id);
if (ids.length) {
  const soldUnitIds = ids.flatMap((id) => itemsByOrder.get(id) ?? []);
  let r = await db.from("popup_order_items").delete().in("order_id", ids);
  if (r.error) throw r.error;
  r = await db.from("popup_orders").delete().in("id", ids);
  if (r.error) throw r.error;
  const holdIds = victims.map((o) => o.hold_id as string | null).filter(Boolean) as string[];
  if (holdIds.length) {
    r = await db.from("popup_units").update({ status: "available", hold_id: null, updated_at: new Date().toISOString() }).in("hold_id", holdIds);
    if (r.error) throw r.error;
    r = await db.from("popup_holds").delete().in("id", holdIds);
    if (r.error) throw r.error;
  }
  if (soldUnitIds.length) {
    r = await db.from("popup_units").update({ status: "available", hold_id: null, updated_at: new Date().toISOString() }).in("id", soldUnitIds);
    if (r.error) throw r.error;
  }
}
const { data: after } = await db.from("popup_units").select("status").in("id", [...testUnitIds]);
console.log(`Deleted ${ids.length} order(s). Test units now: ${(after ?? []).map((u) => u.status).join(", ")}`);
