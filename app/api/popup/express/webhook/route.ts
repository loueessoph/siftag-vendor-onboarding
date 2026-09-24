import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { fromPopup } from "@/lib/supabase/server";
import { constructWebhookEvent, paymentIntentId } from "@/lib/stripe";
import { cancelPendingOrder, markOrderPaid } from "@/lib/express";
import { claimAppPayment } from "@/lib/till";

/**
 * The one Stripe webhook, for every order this app opens: express
 * checkouts and till sales alike. Register it in the Stripe dashboard (or
 * `stripe listen` locally, see README) for:
 *
 *   checkout.session.completed          card paid: units go to 'sold'
 *   checkout.session.async_payment_succeeded   same, for delayed methods
 *   checkout.session.async_payment_failed      release the hold
 *   checkout.session.expired           nobody paid: release the hold
 *   payment_intent.succeeded           till card reader, or Tap to Pay in the
 *                                      Stripe app: units go to 'sold'
 *   payment_intent.canceled            till sale abandoned: release the hold
 *
 * Stripe retries until it gets a 2xx and may deliver an event more than
 * once, so every branch claims the order with a conditional update first;
 * a repeat lands on an order that is no longer pending and is skipped.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, request.headers.get("stripe-signature"));
  } catch (err) {
    console.error("Stripe webhook signature verification failed", (err as Error).message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      // A completed session with payment still pending (bank debit etc.)
      // gets its own async_payment_succeeded later; nothing to do yet.
      if (session.payment_status !== "paid") {
        return NextResponse.json({ ok: true, skipped: "payment not settled yet" });
      }
      return markPaid(session);
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      return release(event.data.object, event.type);
    case "payment_intent.succeeded": {
      // Till sales on the card reader have no Checkout Session; express
      // payments also raise this, but their order is already paid by then.
      const intent = event.data.object;
      return markPaidByIntent(intent);
    }
    case "payment_intent.canceled": {
      const intent = event.data.object;
      return releaseByIntent(intent.id, intent.metadata?.order_id, event.type);
    }
    default:
      return NextResponse.json({ ok: true, skipped: event.type });
  }
}

type OrderRow = { id: string; event_id: string; hold_id: string | null; status: string };
const ORDER_COLUMNS = "id, event_id, hold_id, status";

async function findOrderBy(column: "stripe_checkout_session_id" | "stripe_payment_intent_id", value: string, fallbackOrderId?: string | null) {
  const { data, error } = await fromPopup("popup_orders").select(ORDER_COLUMNS).eq(column, value).maybeSingle();
  if (error) throw error;
  if (data) return data as OrderRow;
  // The Stripe id is written after the object is created; if that write
  // failed, the order id Stripe echoes back in metadata still finds it.
  if (!fallbackOrderId) return null;
  const { data: byId, error: byIdError } = await fromPopup("popup_orders").select(ORDER_COLUMNS).eq("id", fallbackOrderId).maybeSingle();
  if (byIdError) throw byIdError;
  return byId as OrderRow | null;
}

async function markPaid(session: Stripe.Checkout.Session) {
  let order: OrderRow | null;
  try {
    order = await findOrderBy("stripe_checkout_session_id", session.id, session.metadata?.order_id);
  } catch (err) {
    console.error("Order lookup failed for Stripe webhook", err, session.id);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!order) {
    console.error("Stripe webhook for unknown session", session.id);
    return NextResponse.json({ ok: true, skipped: "unknown session" });
  }
  try {
    const done = await markOrderPaid(order, { method: "card", checkoutSessionId: session.id, paymentIntentId: paymentIntentId(session) });
    return NextResponse.json({ ok: true, skipped: done ? undefined : "already processed" });
  } catch (err) {
    console.error("Failed to finalize paid order", err, order.id);
    return NextResponse.json({ error: "Failed to finalize order" }, { status: 500 });
  }
}

async function markPaidByIntent(intent: Stripe.PaymentIntent) {
  const intentId = intent.id;
  let order: OrderRow | null;
  try {
    order = await findOrderBy("stripe_payment_intent_id", intentId, intent.metadata?.order_id);
  } catch (err) {
    console.error("Order lookup failed for Stripe webhook", err, intentId);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!order) {
    // Not one of ours by id: a Tap to Pay payment from the Stripe app,
    // which knows nothing about our orders. Match it to the till order
    // waiting for that amount.
    try {
      const claimed = await claimAppPayment(intent);
      return NextResponse.json({ ok: true, skipped: claimed ? undefined : "no order for intent" });
    } catch (err) {
      console.error("Tap to Pay match failed", err, intentId);
      return NextResponse.json({ error: "Match failed" }, { status: 500 });
    }
  }
  try {
    const done = await markOrderPaid(order, { method: "card", paymentIntentId: intentId });
    return NextResponse.json({ ok: true, skipped: done ? undefined : "already processed" });
  } catch (err) {
    console.error("Failed to finalize paid order", err, order.id);
    return NextResponse.json({ error: "Failed to finalize order" }, { status: 500 });
  }
}

async function release(session: Stripe.Checkout.Session, reason: string) {
  let order: OrderRow | null;
  try {
    order = await findOrderBy("stripe_checkout_session_id", session.id, session.metadata?.order_id);
  } catch (err) {
    console.error("Order lookup failed for Stripe webhook", err, session.id);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!order) return NextResponse.json({ ok: true, skipped: "unknown session" });
  try {
    // Session already gone on Stripe's side: no need to expire it again.
    const released = await cancelPendingOrder({ id: order.id, hold_id: order.hold_id, reason });
    return NextResponse.json({ ok: true, released, reason });
  } catch (err) {
    console.error("Failed to release order after", reason, err, order.id);
    return NextResponse.json({ error: "Failed to release order" }, { status: 500 });
  }
}

async function releaseByIntent(intentId: string, orderId: string | null | undefined, reason: string) {
  let order: OrderRow | null;
  try {
    order = await findOrderBy("stripe_payment_intent_id", intentId, orderId);
  } catch (err) {
    console.error("Order lookup failed for Stripe webhook", err, intentId);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!order) return NextResponse.json({ ok: true, skipped: "no order for intent" });
  try {
    const released = await cancelPendingOrder({ id: order.id, hold_id: order.hold_id, reason });
    return NextResponse.json({ ok: true, released, reason });
  } catch (err) {
    console.error("Failed to release order after", reason, err, order.id);
    return NextResponse.json({ error: "Failed to release order" }, { status: 500 });
  }
}
