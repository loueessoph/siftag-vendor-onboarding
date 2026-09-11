import { NextResponse, type NextRequest } from "next/server";
import { getVendorByToken } from "@/lib/vendor";
import { listEditable } from "@/lib/dates";
import { addCustomItem, removeCustomItem } from "@/lib/custom-items";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Items a brand adds by hand. POST creates one (ticked, with till codes
 * assigned); DELETE removes one, custom items only. Both go through the same
 * deadline gate as every other edit.
 */

async function gate(token: string | undefined) {
  if (!token) return { error: NextResponse.json({ error: "Bad request" }, { status: 400 }) };
  const context = await getVendorByToken(token);
  if (!context) return { error: NextResponse.json({ error: "Unknown link" }, { status: 404 }) };
  if (!listEditable()) {
    return {
      error: NextResponse.json(
        { error: "The product list deadline has passed, so your list is now fixed." },
        { status: 409 }
      ),
    };
  }
  return { context };
}

async function touch(brandId: string) {
  await supabaseAdmin()
    .from("popup_brands")
    .update({ last_saved_at: new Date().toISOString(), submission_status: "in_progress" })
    .eq("id", brandId);
}

export async function POST(request: NextRequest) {
  let body: {
    token?: string;
    title?: string;
    colour?: string;
    imageUrl?: string;
    sizes?: string;
    price?: string | number;
    fibreComposition?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { context, error } = await gate(body.token);
  if (error) return error;

  const title = String(body.title ?? "").trim();
  if (title.length < 2) {
    return NextResponse.json({ error: "Give the item a name." }, { status: 400 });
  }
  const price =
    body.price === "" || body.price == null
      ? null
      : Number(String(body.price).replace(/[£,\s]/g, ""));
  if (price != null && !(Number.isFinite(price) && price > 0)) {
    return NextResponse.json({ error: "That price doesn't look right." }, { status: 400 });
  }
  const sizes = String(body.sizes ?? "")
    .split(/[,/|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  let imageUrl: string | null = null;
  if (body.imageUrl?.trim()) {
    try {
      const parsed = new URL(body.imageUrl.trim());
      if (parsed.protocol === "https:" || parsed.protocol === "http:") imageUrl = parsed.toString();
    } catch {
      return NextResponse.json({ error: "That image link doesn't look right." }, { status: 400 });
    }
  }

  try {
    const productId = await addCustomItem(context.brand.id, context.brand.brand_code, {
      title,
      colour: String(body.colour ?? "").trim() || null,
      imageUrl,
      sizes,
      popupPrice: price,
      fibreComposition: String(body.fibreComposition ?? "").trim() || null,
    });
    await touch(context.brand.id);
    return NextResponse.json({ ok: true, productId });
  } catch (e) {
    console.error("add custom item failed", e);
    return NextResponse.json({ error: "Could not add that item." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let body: { token?: string; productId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { context, error } = await gate(body.token);
  if (error) return error;
  if (!body.productId) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  try {
    const removed = await removeCustomItem(context.brand.id, body.productId);
    if (!removed) {
      return NextResponse.json(
        { error: "Only items you added yourself can be removed. Untick the others instead." },
        { status: 400 }
      );
    }
    await touch(context.brand.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("remove custom item failed", e);
    return NextResponse.json({ error: "Could not remove that item." }, { status: 500 });
  }
}
