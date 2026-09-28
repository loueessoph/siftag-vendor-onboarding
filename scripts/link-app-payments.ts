/**
 * Records till sales that were taken in the Stripe app before the till had
 * a Tap to Pay mode: opens a paid till order per unit, linked to the Stripe
 * PaymentIntent, at the amount actually charged. One-off; safe to re-run
 * (a unit that is already sold is skipped).
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolver.mjs --env-file=.env.local scripts/link-app-payments.ts
 */
import { supabaseAdmin } from "../lib/supabase/server";
import { getActiveEvent } from "../lib/live-event";
import { claimUnitsForCheckout, markOrderPaid } from "../lib/express";
import { generateCollectCode } from "../lib/codes";

const SALES = [
  { unitCode: "CA46FFEE", paymentIntentId: "pi_3UJHzDEXBChQMQdp1u6HO0g4", paidGbp: 38, paidAt: "2026-09-24T19:07:15.000Z", what: "Vintage Cashmere V Neck Jumper S" },
  { unitCode: "26F4925B", paymentIntentId: "pi_3UJH8aEXBChQMQdp0e3YQA8Z", paidGbp: 40.5, paidAt: "2026-09-24T18:12:52.000Z", what: "Vintage Heeled Boots 6 (10% off £45)" },
  // Stripe-app sales with a typed memo and no till order. The memo names the
  // style but not the size, so the piece is the likeliest one still in stock.
  { unitCode: "B0EFECE9", paymentIntentId: "pi_3UJvNEEXBChQMQdp12KPj602", paidGbp: 30, paidAt: "2026-09-26T13:10:00.000Z", what: "Plain and Simple Long Sleeve T-Shirt M Grey (memo: long sleeve grey top)" },
  { unitCode: "36CC1C30", paymentIntentId: "pi_3UKKRsEXBChQMQdp0v0cjfcM", paidGbp: 30, paidAt: "2026-09-27T15:57:00.000Z", what: "Plain and Simple Heavyweight Boxy T-Shirt M Black (memo: heavyweight men's shirt)" },
];

const db = supabaseAdmin();
const event = await getActiveEvent();

for (const sale of SALES) {
  const { data: linked } = await db.from("popup_orders").select("collect_code").eq("stripe_payment_intent_id", sale.paymentIntentId).maybeSingle();
  if (linked) {
    console.log(`${sale.what}: already linked to order ${linked.collect_code}`);
    continue;
  }
  const { holdId } = await claimUnitsForCheckout({
    eventId: event.id,
    unitCodes: [sale.unitCode],
    holdMinutes: 5,
    changedBy: "system",
    note: "till sale (app) recorded after the fact",
  });
  const collectCode = generateCollectCode();
  const { data: order, error } = await db
    .from("popup_orders")
    .insert({
      event_id: event.id,
      order_type: "express",
      source: "till",
      status: "pending_payment",
      collect_code: collectCode,
      hold_id: holdId,
      subtotal_gbp: sale.paidGbp,
      created_at: sale.paidAt,
    })
    .select("id, event_id, hold_id")
    .single();
  if (error) throw error;
  const done = await markOrderPaid(order, { method: "card", paymentIntentId: sale.paymentIntentId });
  if (!done) throw new Error(`Could not mark ${collectCode} paid`);
  // The amount charged, not the list price, and the moment it was taken.
  await db.from("popup_order_items").update({ price_gbp: sale.paidGbp }).eq("order_id", order.id);
  await db.from("popup_orders").update({ paid_at: sale.paidAt }).eq("id", order.id);
  console.log(`${sale.what}: order ${collectCode}, £${sale.paidGbp.toFixed(2)}, unit ${sale.unitCode} sold, ${sale.paymentIntentId}`);
}
