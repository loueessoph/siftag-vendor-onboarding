/**
 * Prices the ZZ Test Brand's Juliette Top (size L) for a rehearsal of the
 * online flow. At £0 the express checkout skips Stripe and marks the order
 * paid, so the bag, confirmation email, pickup code and Order pickup tab can
 * all be tried without a card. Restore the price afterwards.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolver.mjs --env-file=.env.local scripts/test-item-price.ts free
 *   node --experimental-strip-types --import ./scripts/ts-resolver.mjs --env-file=.env.local scripts/test-item-price.ts restore
 */
import { supabaseAdmin } from "../lib/supabase/server";
import { TEST_BRAND_NAME } from "../lib/test-brand";

const mode = process.argv[2];
if (mode !== "free" && mode !== "restore") {
  console.error("Usage: test-item-price.ts free|restore");
  process.exit(1);
}
const ORIGINAL_PRICE = 104;
const price = mode === "free" ? 0 : ORIGINAL_PRICE;

const db = supabaseAdmin();
const { data: brand } = await db.from("popup_brands").select("id").eq("name", TEST_BRAND_NAME).maybeSingle();
if (!brand) throw new Error(`${TEST_BRAND_NAME} not found`);
const { data: products } = await db.from("popup_products").select("id").eq("popup_brand_id", brand.id).eq("title", "Juliette Top");
const productIds = (products ?? []).map((p) => p.id);
const { data: variants, error } = await db
  .from("popup_variants")
  .update({ popup_price: price, online_price: price })
  .in("popup_product_id", productIds)
  .eq("size", "L")
  .select("id, size, popup_price");
if (error) throw error;
console.log(`${TEST_BRAND_NAME} · Juliette Top L now £${price} (${variants?.length ?? 0} variant rows)`);
