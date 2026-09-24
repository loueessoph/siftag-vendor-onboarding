/**
 * Submits a brand's product list on their behalf: the same snapshot the
 * vendor's Submit button takes (app/api/vendor/submit/route.ts), minus the
 * token and the deadline. For a brand whose list we filled in ourselves,
 * so their items reach the admin review and approvals queue.
 *
 * Dry run prints what would be snapshotted and any issues the vendor form
 * would have blocked on; --write submits regardless of those issues, since
 * the reviewer sees them on the cards anyway. --write --strict refuses on
 * issues like the form does.
 *   node --experimental-strip-types --import ./scripts/ts-resolver.mjs --env-file=.env.local scripts/submit-brand.ts india-grace-london --write
 */
import { supabaseAdmin } from "../lib/supabase/server";
import { getSelectorProducts, summarise } from "../lib/selection";

const [slug, ...flags] = process.argv.slice(2);
const write = flags.includes("--write");
const strict = flags.includes("--strict");
if (!slug) { console.error("Usage: submit-brand.ts <slug> [--write] [--strict]"); process.exit(1); }

const db = supabaseAdmin();
const { data: brand, error } = await db.from("popup_brands").select("*").eq("slug", slug).maybeSingle();
if (error) throw error;
if (!brand) { console.error(`No brand with slug "${slug}"`); process.exit(1); }

const products = await getSelectorProducts(brand);
const summary = summarise(products);
console.log(`${brand.name}: ${summary.selectedProducts} products, ${summary.selectedVariants} sizes ticked, ${summary.totalUnits} units declared. Currently ${brand.submission_status}.`);
for (const i of summary.issues) console.log(`  issue:   ${i.title}: ${i.reason}`);
for (const w of summary.warnings) console.log(`  warning: ${w.title}: ${w.reason}`);

const items = products.flatMap((product) =>
  product.variants
    .filter((variant) => variant.selected && (variant.quantityDeclared ?? 0) > 0)
    .map((variant) => ({
      popup_variant_id: variant.id,
      sku: variant.sku ?? `UNASSIGNED-${variant.id.slice(0, 8)}`,
      product_title: product.title,
      size: variant.size,
      colour: variant.colour,
      fibre_composition: product.fibreComposition,
      natural_fibre_pct: product.naturalFibrePct,
      online_price: variant.onlinePrice,
      popup_price: variant.popupPrice,
      quantity_declared: variant.quantityDeclared ?? 0,
    }))
);
console.log(`  snapshot would hold ${items.length} size rows across ${new Set(items.map((i) => i.product_title)).size} titles`);

if (!write) { console.log("Dry run. Re-run with --write to submit."); process.exit(0); }
if (strict && !summary.canSubmit) { console.error("Refusing: issues above (drop --strict to submit anyway)."); process.exit(2); }
if (items.length === 0) { console.error("Nothing to submit: no ticked size has a quantity."); process.exit(2); }

const { data: submission, error: subError } = await db
  .from("popup_submissions")
  .insert({ popup_brand_id: brand.id, item_count: summary.selectedVariants })
  .select("id")
  .single();
if (subError) throw subError;
const { error: itemsError } = await db
  .from("popup_submission_items")
  .insert(items.map((i) => ({ popup_submission_id: submission.id, ...i })));
if (itemsError) {
  await db.from("popup_submissions").delete().eq("id", submission.id);
  throw itemsError;
}
await db.from("popup_submissions").delete().eq("popup_brand_id", brand.id).neq("id", submission.id);
const { error: brandError } = await db
  .from("popup_brands")
  .update({ submission_status: "submitted", submitted_at: new Date().toISOString() })
  .eq("id", brand.id);
if (brandError) throw brandError;
console.log(`Submitted ${items.length} rows for ${brand.name}. They now show on the admin brand page and in Approvals.`);
