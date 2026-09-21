import { NextResponse, type NextRequest } from "next/server";
import { getVendorByToken } from "@/lib/vendor";
import { listEditable } from "@/lib/dates";
import { addSize, removeSize } from "@/lib/custom-items";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Adds a size to any of the brand's products: a run their site doesn't list. */
export async function POST(request: NextRequest) {
  let body: { token?: string; productId?: string; size?: string; colour?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const size = String(body.size ?? "").trim().slice(0, 40);
  if (!body.token || !body.productId || !size) {
    return NextResponse.json({ error: "Type the size first." }, { status: 400 });
  }

  const context = await getVendorByToken(body.token);
  if (!context) return NextResponse.json({ error: "Unknown link" }, { status: 404 });
  if (!listEditable(context.brand)) {
    return NextResponse.json(
      { error: "The product list deadline has passed, so your list is now fixed." },
      { status: 409 }
    );
  }

  try {
    const colour = String(body.colour ?? "").trim().slice(0, 40) || null;
    const variant = await addSize(context.brand.id, context.brand.brand_code, body.productId, size, colour);
    if (!variant) {
      return NextResponse.json({ error: "That size is already there." }, { status: 400 });
    }
    await supabaseAdmin()
      .from("popup_brands")
      .update({ last_saved_at: new Date().toISOString(), submission_status: "in_progress" })
      .eq("id", context.brand.id);
    return NextResponse.json({ ok: true, variant });
  } catch (e) {
    console.error("add size failed", e);
    return NextResponse.json({ error: "Could not add that size." }, { status: 500 });
  }
}

/** Removes a size the brand added. Scraped sizes are refused: untick them. */
export async function DELETE(request: NextRequest) {
  let body: { token?: string; variantId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!body.token || !body.variantId) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const context = await getVendorByToken(body.token);
  if (!context) return NextResponse.json({ error: "Unknown link" }, { status: 404 });
  if (!listEditable(context.brand)) {
    return NextResponse.json(
      { error: "The product list deadline has passed, so your list is now fixed." },
      { status: 409 }
    );
  }
  try {
    const removed = await removeSize(context.brand.id, body.variantId);
    if (!removed) {
      return NextResponse.json(
        { error: "That size isn't on your list." },
        { status: 400 }
      );
    }
    await supabaseAdmin()
      .from("popup_brands")
      .update({ last_saved_at: new Date().toISOString(), submission_status: "in_progress" })
      .eq("id", context.brand.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("remove size failed", e);
    return NextResponse.json({ error: "Could not remove that size." }, { status: 500 });
  }
}
