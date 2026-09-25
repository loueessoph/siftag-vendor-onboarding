/**
 * The safety net under the Stripe webhook. Every pending order with a
 * Stripe object is checked against Stripe: paid means the order is marked
 * paid and its pieces sold, an expired session means it is cancelled and
 * the pieces go back on the floor. Called from endpoints the staff phones
 * poll anyway, throttled so Stripe is asked at most once a minute per
 * server, so a webhook that never arrives costs at most a minute.
 */

import { fromPopup, supabaseAdmin } from "./supabase/server";
import { stripe } from "./stripe";
import { cancelPendingOrder, getUnitsLineItems, markOrderPaid } from "./express";

const EVERY_MS = 60_000;
let lastRun = 0;
let running: Promise<void> | null = null;

export function reconcilePendingOrders(): Promise<void> {
  if (running) return running;
  if (Date.now() - lastRun < EVERY_MS) return Promise.resolve();
  lastRun = Date.now();
  running = run()
    .catch((err) => console.error("Reconcile against Stripe failed", err))
    .finally(() => {
      running = null;
    });
  return running;
}

async function run(): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;
  const db = supabaseAdmin();
  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const { data: pending, error } = await fromPopup("popup_orders")
    .select("id, event_id, hold_id, collect_code, subtotal_gbp, stripe_checkout_session_id, stripe_payment_intent_id, created_at")
    .eq("status", "pending_payment")
    .gte("created_at", since)
    .or("stripe_checkout_session_id.not.is.null,stripe_payment_intent_id.not.is.null");
  if (error) throw error;

  for (const o of pending ?? []) {
    try {
      let paidIntent: string | null = null;
      let sessionId: string | null = null;
      let gone = false;
      if (o.stripe_checkout_session_id) {
        const cs = await stripe().checkout.sessions.retrieve(o.stripe_checkout_session_id as string);
        if (cs.payment_status === "paid") {
          paidIntent = typeof cs.payment_intent === "string" ? cs.payment_intent : (cs.payment_intent?.id ?? null);
          sessionId = cs.id;
        } else if (cs.status === "expired") gone = true;
      } else if (o.stripe_payment_intent_id) {
        const pi = await stripe().paymentIntents.retrieve(o.stripe_payment_intent_id as string);
        if (pi.status === "succeeded") paidIntent = pi.id;
        else if (pi.status === "canceled") gone = true;
      }
      const order = { id: o.id as string, event_id: o.event_id as string, hold_id: o.hold_id as string | null };
      if (paidIntent) {
        const { data: held } = await fromPopup("popup_units").select("id").eq("hold_id", order.hold_id ?? "");
        if (held && held.length > 0) {
          await markOrderPaid(order, { method: "card", paymentIntentId: paidIntent, checkoutSessionId: sessionId });
        } else {
          await recoverPaidOrder(order, o.collect_code as string, Number(o.subtotal_gbp ?? 0), paidIntent);
        }
        console.log(`Reconciled ${o.collect_code}: paid on Stripe, now paid here`);
      } else if (gone) {
        await cancelPendingOrder({ ...order, reason: "payment page expired (reconciled)" });
        console.log(`Reconciled ${o.collect_code}: never paid, cancelled`);
      }
    } catch (err) {
      console.error("Reconcile failed for", o.collect_code, err);
    }
  }
}

/**
 * A paid order whose hold was already released (staff marked the piece
 * sold by hand while waiting, or the hold timed out): the pieces are found
 * from the unit events written when the order claimed them, and the sale is
 * recorded against them so it reaches the vendor's figures.
 */
async function recoverPaidOrder(order: { id: string; event_id: string; hold_id: string | null }, collectCode: string, subtotal: number, paidIntent: string) {
  const db = supabaseAdmin();
  const { data: row } = await fromPopup("popup_orders").select("created_at").eq("id", order.id).single();
  const at = new Date(row?.created_at as string).getTime();
  const { data: events } = await fromPopup("popup_unit_events")
    .select("popup_unit_id")
    .eq("to_status", "held")
    .gte("created_at", new Date(at - 60_000).toISOString())
    .lte("created_at", new Date(at + 60_000).toISOString());
  const lines = await getUnitsLineItems([...new Set((events ?? []).map((e) => e.popup_unit_id as string))]);
  const total = lines.reduce((s, l) => s + l.priceGbp, 0);
  if (lines.length === 0 || Math.abs(total - subtotal) > 0.01) {
    throw new Error(`could not recover the pieces of ${collectCode}: found ${lines.length} worth £${total.toFixed(2)}`);
  }
  const now = new Date().toISOString();
  const { data: claimed } = await db
    .from("popup_orders")
    .update({ status: "paid", paid_at: now, payment_method: "card", stripe_payment_intent_id: paidIntent })
    .eq("id", order.id)
    .eq("status", "pending_payment")
    .select("id");
  if (!claimed || claimed.length === 0) return;
  for (const li of lines) {
    await db.from("popup_units").update({ status: "sold", hold_id: null, updated_at: now }).eq("id", li.unitId);
    await db.from("popup_order_items").insert({ order_id: order.id, popup_unit_id: li.unitId, popup_brand_id: li.brandId, price_gbp: li.priceGbp });
    await db.from("popup_unit_events").insert({
      popup_unit_id: li.unitId,
      event_id: order.event_id,
      from_status: "sold",
      to_status: "sold",
      changed_by: "system",
      note: `payment confirmed late for ${collectCode} (webhook missed)`,
    });
  }
}
