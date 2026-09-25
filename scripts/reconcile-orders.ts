/**
 * Squares pending orders with Stripe when the webhook hasn't: an order whose
 * Checkout Session or PaymentIntent has been paid is marked paid (its units
 * sold, the order items written), and one whose session expired unpaid is
 * cancelled. Dry run unless --write.
 *
 * If a paid order's hold was already released (staff marked the piece sold
 * by hand while waiting), the pieces are recovered from the hold's unit
 * events so the sale still lands in the vendor's figures.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolver.mjs --env-file=.env.local scripts/reconcile-orders.ts --write
 */
import { supabaseAdmin } from "../lib/supabase/server";
import { stripe } from "../lib/stripe";
import { cancelPendingOrder, getUnitsLineItems, markOrderPaid } from "../lib/express";

const write = process.argv.includes("--write");
const db = supabaseAdmin();

const { data: pending } = await db
  .from("popup_orders")
  .select("id, event_id, hold_id, collect_code, source, subtotal_gbp, stripe_checkout_session_id, stripe_payment_intent_id, created_at")
  .eq("status", "pending_payment")
  .order("created_at");

for (const o of pending ?? []) {
  let paidIntent: string | null = null;
  let sessionId: string | null = null;
  let expired = false;
  if (o.stripe_checkout_session_id) {
    const cs = await stripe().checkout.sessions.retrieve(o.stripe_checkout_session_id);
    if (cs.payment_status === "paid") {
      paidIntent = typeof cs.payment_intent === "string" ? cs.payment_intent : (cs.payment_intent?.id ?? null);
      sessionId = cs.id;
    } else if (cs.status === "expired") expired = true;
  } else if (o.stripe_payment_intent_id) {
    const pi = await stripe().paymentIntents.retrieve(o.stripe_payment_intent_id);
    if (pi.status === "succeeded") paidIntent = pi.id;
    else if (pi.status === "canceled") expired = true;
  } else if (Date.now() - new Date(o.created_at).getTime() > 2 * 3600 * 1000) {
    expired = true; // Tap to Pay order nobody ever paid
  }

  if (paidIntent) {
    console.log(`${o.collect_code} ${o.source} £${o.subtotal_gbp}: PAID on Stripe (${paidIntent}) but pending here`);
    if (!write) continue;
    const { data: held } = await db.from("popup_units").select("id").eq("hold_id", o.hold_id);
    if (held && held.length > 0) {
      await markOrderPaid(o, { method: "card", paymentIntentId: paidIntent, checkoutSessionId: sessionId });
      console.log(`  marked paid with ${held.length} piece(s)`);
      continue;
    }
    // Hold already released: recover the pieces that were held for it.
    const { data: events } = await db
      .from("popup_unit_events")
      .select("popup_unit_id, created_at")
      .eq("to_status", "held")
      .gte("created_at", new Date(new Date(o.created_at).getTime() - 60_000).toISOString())
      .lte("created_at", new Date(new Date(o.created_at).getTime() + 60_000).toISOString());
    const unitIds = [...new Set((events ?? []).map((e) => e.popup_unit_id as string))];
    const lines = await getUnitsLineItems(unitIds);
    const total = lines.reduce((s, l) => s + l.priceGbp, 0);
    if (lines.length === 0 || Math.abs(total - Number(o.subtotal_gbp)) > 0.01) {
      console.log(`  could not recover the pieces (found ${lines.length}, £${total.toFixed(2)}); fix by hand`);
      continue;
    }
    const now = new Date().toISOString();
    await db.from("popup_orders").update({ status: "paid", paid_at: now, payment_method: "card", stripe_payment_intent_id: paidIntent }).eq("id", o.id);
    for (const li of lines) {
      await db.from("popup_units").update({ status: "sold", hold_id: null, updated_at: now }).eq("id", li.unitId);
      await db.from("popup_order_items").insert({ order_id: o.id, popup_unit_id: li.unitId, popup_brand_id: li.brandId, price_gbp: li.priceGbp });
      await db.from("popup_unit_events").insert({ popup_unit_id: li.unitId, event_id: o.event_id, from_status: "sold", to_status: "sold", changed_by: "system", note: `payment confirmed late for ${o.collect_code} (webhook missed)` });
    }
    console.log(`  marked paid, ${lines.length} piece(s) recovered: ${lines.map((l) => l.unitCode).join(", ")}`);
  } else if (expired) {
    console.log(`${o.collect_code} ${o.source} £${o.subtotal_gbp}: never paid, session expired -> cancel`);
    if (write) await cancelPendingOrder({ id: o.id, hold_id: o.hold_id, reason: "payment page expired (reconciled)" });
  } else {
    console.log(`${o.collect_code} ${o.source} £${o.subtotal_gbp}: still open, leave it`);
  }
}
if (!write) console.log("Dry run. Re-run with --write to apply.");
