import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getVendorByToken } from "@/lib/vendor";

/**
 * Autosave for the product selector. One field at a time, debounced by the
 * client.
 *
 * The token identifies the brand, but it is never trusted to identify the
 * *row* — every write re-checks that the product or variant actually belongs
 * to that brand, so a tampered id can't reach another brand's catalogue.
 */

const PRODUCT_FIELDS = new Set([
  "fibre_composition",
  "natural_fibre_pct",
  "care_notes",
  "sizing_notes",
]);

const VARIANT_FIELDS = new Set([
  "selected",
  "popup_price",
  "quantity_declared",
]);

export async function POST(request: NextRequest) {
  let body: {
    token?: string;
    productId?: string;
    variantId?: string;
    patch?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { token, productId, variantId, patch } = body;
  if (!token || !patch) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const context = await getVendorByToken(token);
  if (!context) {
    return NextResponse.json({ error: "Unknown link" }, { status: 404 });
  }
  if (context.brand.submission_status === "submitted") {
    return NextResponse.json(
      { error: "Your list has been submitted, so it's now read-only." },
      { status: 409 }
    );
  }

  const db = supabaseAdmin();
  const brandId = context.brand.id;

  try {
    if (productId) {
      const clean = pick(patch, PRODUCT_FIELDS);
      if (Object.keys(clean).length === 0) {
        return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
      }
      // Scoped by brand as well as id — this is the ownership check.
      const { data, error } = await db
        .from("popup_products")
        .update(clean)
        .eq("id", productId)
        .eq("popup_brand_id", brandId)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    } else if (variantId) {
      const clean = pick(patch, VARIANT_FIELDS);
      if (Object.keys(clean).length === 0) {
        return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
      }
      // Variants don't carry a brand id, so ownership is checked by walking
      // up to the product first.
      const { data: owned, error: ownerError } = await db
        .from("popup_variants")
        .select("id, popup_products!inner(popup_brand_id)")
        .eq("id", variantId)
        .eq("popup_products.popup_brand_id", brandId)
        .maybeSingle();
      if (ownerError) throw ownerError;
      if (!owned) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const { error } = await db
        .from("popup_variants")
        .update(clean)
        .eq("id", variantId);
      if (error) throw error;
    } else {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    await db
      .from("popup_brands")
      .update({
        last_saved_at: new Date().toISOString(),
        submission_status: "in_progress",
      })
      .eq("id", brandId);

    return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error("vendor save failed", error);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}

function pick(
  patch: Record<string, unknown>,
  allowed: Set<string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (allowed.has(key)) out[key] = value;
  }
  return out;
}
