import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getActiveEvent, releaseExpiredHolds } from "@/lib/live-event";
import { claimUnitsForCheckout, getUnitsLineItems, upsertCustomer, UnitsUnavailableError } from "@/lib/express";
import { generateCollectCode } from "@/lib/codes";
import { createDraftOrder } from "@/lib/shopify-client";

const MAX_ITEMS = 10;

/**
 * Express buyer: pay online now, collect at the counter, no fitting room.
 * Claims the chosen units (all-or-nothing), opens a Shopify draft order for
 * payment, and returns the hosted invoice URL + a short collect code.
 */
export async function POST(request: NextRequest) {
  let body: { unitCodes?: unknown; email?: unknown; phone?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const unitCodes = Array.isArray(body.unitCodes)
    ? body.unitCodes.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    : [];
  if (unitCodes.length === 0) {
    return NextResponse.json({ error: "Select at least one item" }, { status: 400 });
  }
  if (unitCodes.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Max ${MAX_ITEMS} items per order` }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email : undefined;
  const phone = typeof body.phone === "string" ? body.phone : undefined;
  if (!email && !phone) {
    return NextResponse.json({ error: "Enter an email or phone number" }, { status: 400 });
  }

  const db = supabaseAdmin();

  try {
    const event = await getActiveEvent();
    await releaseExpiredHolds(event.id);

    const { holdId, unitIds } = await claimUnitsForCheckout({
      eventId: event.id,
      unitCodes,
      holdMinutes: event.express_hold_minutes,
    });

    const customerId = await upsertCustomer({ email, phone, name: body.name as string | undefined });
    const lineItems = await getUnitsLineItems(unitIds);
    const subtotalGbp = lineItems.reduce((sum, li) => sum + li.priceGbp, 0);

    let collectCode = generateCollectCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: clash } = await db.from("popup_orders").select("id").eq("collect_code", collectCode).maybeSingle();
      if (!clash) break;
      collectCode = generateCollectCode();
    }

    const { data: order, error: orderError } = await db
      .from("popup_orders")
      .insert({
        event_id: event.id,
        customer_id: customerId,
        order_type: "express",
        status: "pending_payment",
        collect_code: collectCode,
        hold_id: holdId,
        subtotal_gbp: subtotalGbp,
      })
      .select("id")
      .single();
    if (orderError) throw orderError;

    try {
      const draftOrder = await createDraftOrder({
        lineItems: lineItems.map((li) => ({
          title: `${li.productTitle} — ${li.brandName}${li.size ? ` (${li.size})` : ""}`,
          price: li.priceGbp.toFixed(2),
          quantity: 1,
          sku: li.unitCode,
        })),
        email,
        phone,
        note: `Siftag Pop-Up express order ${collectCode}`,
      });

      await db
        .from("popup_orders")
        .update({ shopify_draft_order_id: draftOrder.id, shopify_invoice_url: draftOrder.invoiceUrl })
        .eq("id", order.id);

      return NextResponse.json({ collectCode, invoiceUrl: draftOrder.invoiceUrl, subtotalGbp });
    } catch (shopifyError) {
      // Payment provider unavailable — release everything we claimed so the
      // items go straight back on the floor instead of sitting held.
      await db.from("popup_units").update({ status: "available", hold_id: null }).in("id", unitIds);
      await db.from("popup_holds").update({ status: "released", released_at: new Date().toISOString() }).eq("id", holdId);
      await db.from("popup_orders").update({ status: "cancelled" }).eq("id", order.id);
      console.error("Shopify draft order failed; released hold", shopifyError, collectCode);
      return NextResponse.json({ error: "Payments are temporarily unavailable. Please try again." }, { status: 503 });
    }
  } catch (err) {
    if (err instanceof UnitsUnavailableError) {
      return NextResponse.json({ error: "just_missed_it", unavailableCodes: err.unavailableCodes }, { status: 409 });
    }
    console.error("Express checkout failed", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
