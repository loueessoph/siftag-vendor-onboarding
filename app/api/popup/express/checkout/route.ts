import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getActiveEvent, releaseExpiredHolds } from "@/lib/live-event";
import {
  cancelPendingOrder,
  claimUnitsForCheckout,
  getUnitsLineItems,
  upsertCustomer,
  UnitsUnavailableError,
} from "@/lib/express";
import { generateCollectCode } from "@/lib/codes";
import { createCheckoutSession, MIN_CHECKOUT_MINUTES, siteOrigin } from "@/lib/stripe";

const MAX_ITEMS = 10;

/**
 * Express buyer: pay online now, collect at the counter, no fitting room.
 * Claims the chosen units (all-or-nothing), opens a Stripe Checkout Session
 * for payment, and returns its URL + a short collect code. The Stripe
 * webhook turns the held units into sold ones once the payment lands.
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
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : undefined;
  const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : undefined;
  if (!email && !phone) {
    return NextResponse.json({ error: "Enter an email or phone number" }, { status: 400 });
  }

  const db = supabaseAdmin();

  try {
    const event = await getActiveEvent();
    await releaseExpiredHolds(event.id);

    // The hold must outlive the Stripe session (30 minutes minimum), or a
    // shopper could pay for a garment that has already gone back on the floor.
    const holdMinutes = Math.max(event.express_hold_minutes, MIN_CHECKOUT_MINUTES);
    const { holdId, unitIds } = await claimUnitsForCheckout({
      eventId: event.id,
      unitCodes,
      holdMinutes,
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
        source: "express",
        status: "pending_payment",
        collect_code: collectCode,
        hold_id: holdId,
        subtotal_gbp: subtotalGbp,
      })
      .select("id")
      .single();
    if (orderError) throw orderError;

    try {
      const origin = siteOrigin();
      const codes = lineItems.map((li) => li.unitCode).join(",");
      const session = await createCheckoutSession({
        orderId: order.id,
        collectCode,
        source: "express",
        lineItems,
        email,
        expiresInMinutes: holdMinutes,
        successUrl: `${origin}/popup/express/confirm/${collectCode}`,
        cancelUrl: `${origin}/popup/express?codes=${encodeURIComponent(codes)}&cancelled=${collectCode}`,
      });

      await db
        .from("popup_orders")
        .update({ stripe_checkout_session_id: session.id })
        .eq("id", order.id);

      return NextResponse.json({ collectCode, checkoutUrl: session.url, subtotalGbp });
    } catch (stripeError) {
      // Payment provider unavailable — release everything we claimed so the
      // items go straight back on the floor instead of sitting held.
      await cancelPendingOrder({ id: order.id, hold_id: holdId });
      console.error("Stripe Checkout Session failed; released hold", stripeError, collectCode);
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
