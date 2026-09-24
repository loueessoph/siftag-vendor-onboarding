import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getActiveEvent, releaseExpiredHolds } from "@/lib/live-event";
import {
  cancelPendingOrder,
  claimUnitsForCheckout,
  getUnitsLineItems,
  markOrderPaid,
  releaseClaim,
  upsertCustomer,
  UnitsUnavailableError,
} from "@/lib/express";
import { generateCollectCode } from "@/lib/codes";
import { createCheckoutSession, MIN_CHECKOUT_MINUTES, siteOrigin } from "@/lib/stripe";
import { TEST_BRAND_NAME } from "@/lib/test-brand";

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

    // From here until the order row exists, any failure must hand the
    // garments back, or they'd sit held for half an hour for nobody.
    let customerId: string;
    let lineItems: Awaited<ReturnType<typeof getUnitsLineItems>>;
    let subtotalGbp: number;
    let collectCode: string;
    let order: { id: string };
    try {
      customerId = await upsertCustomer({ email, phone, name: body.name as string | undefined });
      lineItems = await getUnitsLineItems(unitIds);
      subtotalGbp = lineItems.reduce((sum, li) => sum + li.priceGbp, 0);

      collectCode = generateCollectCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: clash } = await db.from("popup_orders").select("id").eq("collect_code", collectCode).maybeSingle();
        if (!clash) break;
        collectCode = generateCollectCode();
      }

      const { data: created, error: orderError } = await db
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
      order = created;
    } catch (err) {
      await releaseClaim(holdId, unitIds, event.id, "checkout could not be opened");
      throw err;
    }

    // Stripe won't open a £0 session. The only £0 items allowed through are
    // the test brand's, priced that way on purpose so the online flow can be
    // rehearsed without a card: they are marked paid on the spot. A real
    // item with no price is a catalogue mistake, not a giveaway.
    if (subtotalGbp <= 0) {
      const allTest = lineItems.every((li) => li.brandName === TEST_BRAND_NAME);
      if (!allTest) {
        await cancelPendingOrder({ id: order.id, hold_id: holdId });
        return NextResponse.json({ error: "One of these items has no price yet. Please ask at the counter." }, { status: 400 });
      }
      await markOrderPaid({ id: order.id, event_id: event.id, hold_id: holdId }, { method: "free" });
      return NextResponse.json({
        collectCode,
        checkoutUrl: `${siteOrigin()}/popup/express/confirm/${collectCode}`,
        subtotalGbp,
      });
    }

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
        cancelUrl: `${origin}/popup/bag?cancelled=${collectCode}&codes=${encodeURIComponent(codes)}`,
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
