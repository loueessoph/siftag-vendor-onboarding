import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getVendorByToken } from "@/lib/vendor";
import { getSelectorProducts, summarise } from "@/lib/selection";
import { notifyListSubmitted } from "@/lib/email";

/**
 * Submitting freezes the list.
 *
 * The snapshot is the point: the live catalogue keeps moving after this — the
 * brand discounts something, deletes a product, restocks — so tags, the till
 * and the payout all read from the copy taken here, and nothing a brand does
 * to their website in late September can change what they're owed.
 */
export async function POST(request: NextRequest) {
  let token: string | undefined;
  try {
    ({ token } = await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!token) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const context = await getVendorByToken(token);
  if (!context) {
    return NextResponse.json({ error: "Unknown link" }, { status: 404 });
  }
  if (context.brand.submission_status === "submitted") {
    return NextResponse.json(
      { error: "This list has already been submitted." },
      { status: 409 }
    );
  }

  const products = await getSelectorProducts(context.brand.id);
  const summary = summarise(products);

  // Re-checked server-side against the same rules the selector shows inline,
  // so a stale page or a poked request can't get an incomplete list in.
  if (!summary.canSubmit) {
    return NextResponse.json(
      {
        error:
          summary.selectedProducts === 0
            ? "Select at least one item before submitting."
            : `${summary.issues.length} item${
                summary.issues.length === 1 ? "" : "s"
              } still need attention.`,
        issues: summary.issues,
      },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  const { data: submission, error: submissionError } = await db
    .from("popup_submissions")
    .insert({
      popup_brand_id: context.brand.id,
      item_count: summary.selectedVariants,
    })
    .select("id")
    .single();
  if (submissionError) {
    console.error("submission header failed", submissionError);
    return NextResponse.json({ error: "Could not submit" }, { status: 500 });
  }

  const items = products.flatMap((product) =>
    product.variants
      .filter((variant) => variant.selected)
      .map((variant) => ({
        popup_submission_id: submission.id,
        popup_variant_id: variant.id,
        // Copied, not joined — the snapshot has to survive the source row
        // changing or being deleted.
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

  const { error: itemsError } = await db
    .from("popup_submission_items")
    .insert(items);
  if (itemsError) {
    console.error("submission items failed", itemsError);
    // Leave no half-written submission behind for the till export to find.
    await db.from("popup_submissions").delete().eq("id", submission.id);
    return NextResponse.json({ error: "Could not submit" }, { status: 500 });
  }

  const submittedAt = new Date().toISOString();
  const { error: brandError } = await db
    .from("popup_brands")
    .update({ submission_status: "submitted", submitted_at: submittedAt })
    .eq("id", context.brand.id)
    .eq("submission_status", "in_progress");
  if (brandError) {
    console.error("brand submit flag failed", brandError);
  }

  await notifyListSubmitted(context.brand, summary);

  return NextResponse.json({
    ok: true,
    items: items.length,
    units: summary.totalUnits,
  });
}
