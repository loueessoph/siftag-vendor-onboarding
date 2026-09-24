/**
 * The till: a member of staff scans tags into a basket and takes payment.
 * Three ways to settle, all ending in markOrderPaid so the units flip to
 * 'sold' the same way an express order does:
 *
 *   terminal  a Stripe Terminal card reader at STRIPE_TERMINAL_LOCATION_ID,
 *             driven server-side (PaymentIntent -> reader.process_payment_intent)
 *   qr        no reader: a Checkout Session shown as a QR the customer pays
 *             on their phone
 *   app       Tap to Pay in the Stripe Dashboard app on a staff phone. The
 *             app takes the payment on its own; this side finds it on
 *             Stripe by amount (and the collect code in its description)
 *             and marks the order paid
 *   cash      no Stripe at all; staff confirm the money changed hands
 *
 * Card payments are confirmed by the shared webhook, and the till's status
 * poll also asks Stripe directly, so a missed webhook never strands a sale.
 */

import { randomBytes } from "node:crypto";
import { fromPopup, supabaseAdmin } from "./supabase/server";
import { getActiveEvent, releaseExpiredHolds } from "./live-event";
import {
  cancelPendingOrder,
  claimUnitsForCheckout,
  getUnitsLineItems,
  markOrderPaid,
  upsertCustomer,
  UnitsUnavailableError,
} from "./express";
import { generateCollectCode } from "./codes";
import { createCheckoutSession, MIN_CHECKOUT_MINUTES, siteOrigin, stripe } from "./stripe";

export type TillMode = "terminal" | "qr" | "app" | "cash";

export function terminalEnabled(): boolean {
  return Boolean(process.env.STRIPE_TERMINAL_LOCATION_ID);
}

/** A scanned QR is the tag URL; a typed code is just the code. Both end in the eight-character unit code. */
export function unitCodeFrom(input: string): string {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/popup\/tag\/([A-Za-z0-9]+)/);
  return (fromUrl ? fromUrl[1] : trimmed).toUpperCase();
}

export type TillLine = {
  unitCode: string;
  status: string;
  productTitle: string;
  brandName: string;
  size: string | null;
  priceGbp: number;
};

/** What a scanned tag is, and whether it can be sold right now. */
export async function lookupUnit(input: string): Promise<TillLine | null> {
  const code = unitCodeFrom(input);
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return null;
  const { data: unit, error } = await fromPopup("popup_units")
    .select("id, event_id, status")
    .eq("unit_code", code)
    .maybeSingle();
  if (error) throw error;
  if (!unit) return null;
  await releaseExpiredHolds(unit.event_id);
  const { data: fresh } = await fromPopup("popup_units").select("status").eq("id", unit.id).single();
  const [line] = await getUnitsLineItems([unit.id]);
  if (!line) return null;
  return {
    unitCode: line.unitCode,
    status: (fresh?.status ?? unit.status) as string,
    productTitle: line.productTitle,
    brandName: line.brandName,
    size: line.size,
    priceGbp: line.priceGbp,
  };
}

/**
 * "One more of these": the next spare tag for the same product, size and
 * colour, skipping any already in the basket. When every tag on record is
 * taken, the stock count was simply short, so a new unit is created rather
 * than turning the sale away; the new code is printed on nothing, which is
 * fine, since the garment is leaving the building.
 */
export async function anotherUnit(unitCode: string, excludeCodes: string[]): Promise<(TillLine & { created: boolean }) | null> {
  const db = supabaseAdmin();
  const { data: unit, error } = await fromPopup("popup_units")
    .select("id, event_id, popup_variant_id")
    .eq("unit_code", unitCodeFrom(unitCode))
    .maybeSingle();
  if (error) throw error;
  if (!unit) return null;

  const exclude = new Set(excludeCodes.map((c) => c.toUpperCase()));
  const { data: siblings, error: sibError } = await fromPopup("popup_units")
    .select("id, unit_code")
    .eq("popup_variant_id", unit.popup_variant_id)
    .eq("event_id", unit.event_id)
    .eq("status", "available")
    .order("unit_code");
  if (sibError) throw sibError;
  let spare = (siblings ?? []).find((u) => !exclude.has(u.unit_code as string)) ?? null;
  let created = false;

  if (!spare) {
    let code = "";
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = randomBytes(4).toString("hex").toUpperCase();
      const { data: clash } = await fromPopup("popup_units").select("id").eq("unit_code", candidate).maybeSingle();
      if (!clash) code = candidate;
    }
    if (!code) throw new Error("Could not allocate a tag code.");
    const { data: made, error: makeError } = await db
      .from("popup_units")
      .insert({ event_id: unit.event_id, popup_variant_id: unit.popup_variant_id, unit_code: code, status: "available" })
      .select("id, unit_code")
      .single();
    if (makeError) throw makeError;
    spare = made;
    created = true;
  }

  const [line] = await getUnitsLineItems([spare.id as string]);
  return line
    ? { unitCode: line.unitCode, status: "available", productTitle: line.productTitle, brandName: line.brandName, size: line.size, priceGbp: line.priceGbp, created }
    : null;
}

export type TillOrder = {
  collectCode: string;
  status: "pending_payment" | "paid" | "cancelled";
  mode: TillMode;
  totalGbp: number;
  /** qr mode: the page the customer pays on. */
  checkoutUrl?: string;
  /** terminal mode: which reader was told to collect. */
  readerLabel?: string;
  /** Anything the operator should read: a declined card, no reader online. */
  message?: string;
};

async function newCollectCode(): Promise<string> {
  const db = supabaseAdmin();
  let code = generateCollectCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: clash } = await db.from("popup_orders").select("id").eq("collect_code", code).maybeSingle();
    if (!clash) break;
    code = generateCollectCode();
  }
  return code;
}

/**
 * Claims the basket (all-or-nothing, same as express), opens the order and
 * starts payment in the chosen mode. Throws UnitsUnavailableError when a
 * tag was sold or held between scanning and charging.
 */
export async function openTillOrder(params: {
  unitCodes: string[];
  mode: TillMode;
  staffName: string;
  email?: string;
}): Promise<TillOrder> {
  const db = supabaseAdmin();
  const event = await getActiveEvent();
  await releaseExpiredHolds(event.id);

  const mode = params.mode === "terminal" && !terminalEnabled() ? "qr" : params.mode;
  // A Tap to Pay sale has nothing on Stripe until the app takes the money,
  // so its order row is the only record. Its "mode" is that very absence:
  // no session id, no intent id, still pending (see tillOrderStatus).
  const holdMinutes = mode === "cash" ? 5 : Math.max(event.express_hold_minutes, MIN_CHECKOUT_MINUTES);
  const { holdId, unitIds } = await claimUnitsForCheckout({
    eventId: event.id,
    unitCodes: params.unitCodes,
    holdMinutes,
    changedBy: params.staffName,
    note: `till sale (${mode}) pending payment`,
  });

  const lineItems = await getUnitsLineItems(unitIds);
  const totalGbp = lineItems.reduce((sum, li) => sum + li.priceGbp, 0);
  const collectCode = await newCollectCode();

  // An email at the till means "send me the receipt": keep a customer so the
  // confirmation can find it once the payment lands.
  const customerId = params.email ? await upsertCustomer({ email: params.email }) : null;
  const { data: order, error: orderError } = await db
    .from("popup_orders")
    .insert({
      event_id: event.id,
      customer_id: customerId,
      order_type: "express",
      source: "till",
      status: "pending_payment",
      collect_code: collectCode,
      hold_id: holdId,
      subtotal_gbp: totalGbp,
    })
    .select("id, event_id, hold_id")
    .single();
  if (orderError) {
    // No order row to cancel through: undo the claim by hand, with the same audit event.
    const nowIso = new Date().toISOString();
    await db.from("popup_units").update({ status: "available", hold_id: null, updated_at: nowIso }).in("id", unitIds);
    await db.from("popup_holds").update({ status: "released", released_at: nowIso }).eq("id", holdId);
    await db.from("popup_unit_events").insert(
      unitIds.map((id) => ({ popup_unit_id: id, event_id: event.id, from_status: "held", to_status: "available", changed_by: "system", note: "till sale could not be opened" }))
    );
    throw orderError;
  }

  const base = { collectCode, mode, totalGbp } as const;

  try {
    if (mode === "cash") {
      await markOrderPaid(order, { method: "cash", changedBy: params.staffName });
      return { ...base, status: "paid" };
    }

    if (mode === "app") {
      return { ...base, status: "pending_payment" };
    }

    if (mode === "qr") {
      const origin = siteOrigin();
      const session = await createCheckoutSession({
        orderId: order.id,
        collectCode,
        source: "till",
        lineItems,
        email: params.email,
        expiresInMinutes: holdMinutes,
        successUrl: `${origin}/popup/express/confirm/${collectCode}`,
        cancelUrl: `${origin}/popup/express/confirm/${collectCode}`,
      });
      await db.from("popup_orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);
      return { ...base, status: "pending_payment", checkoutUrl: session.url };
    }

    // terminal
    const location = process.env.STRIPE_TERMINAL_LOCATION_ID!;
    const readers = await stripe().terminal.readers.list({ location, status: "online", limit: 5 });
    const reader = readers.data[0];
    if (!reader) throw new Error("No card reader is online at this location.");

    const intent = await stripe().paymentIntents.create({
      amount: Math.round(totalGbp * 100),
      currency: "gbp",
      payment_method_types: ["card_present"],
      capture_method: "automatic",
      description: `Siftag Pop-Up till order ${collectCode}`,
      receipt_email: params.email,
      metadata: { order_id: order.id, collect_code: collectCode, source: "till" },
    });
    await db.from("popup_orders").update({ stripe_payment_intent_id: intent.id }).eq("id", order.id);
    await stripe().terminal.readers.processPaymentIntent(reader.id, { payment_intent: intent.id });
    return { ...base, status: "pending_payment", readerLabel: reader.label ?? reader.id };
  } catch (err) {
    // Payment never started: put the garments back straight away.
    await cancelPendingOrder({ id: order.id, hold_id: order.hold_id, reason: "till payment could not start" });
    throw err;
  }
}

/**
 * Where a till order stands. For card orders still pending, asks Stripe
 * directly as well, so the sale completes even if the webhook is late or
 * (locally) not forwarded at all.
 */
export async function tillOrderStatus(collectCode: string): Promise<TillOrder | null> {
  const { data: order, error } = await fromPopup("popup_orders")
    .select("id, event_id, hold_id, status, source, subtotal_gbp, payment_method, stripe_checkout_session_id, stripe_payment_intent_id, collect_code, created_at")
    .eq("collect_code", collectCode.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  let status = order.status as TillOrder["status"];
  let message: string | undefined;
  let checkoutUrl: string | undefined;
  const mode: TillMode =
    order.payment_method === "cash"
      ? "cash"
      : order.stripe_checkout_session_id
        ? "qr"
        : order.stripe_payment_intent_id
          ? "terminal"
          : "app";

  if (status === "pending_payment") {
    try {
      if (order.stripe_checkout_session_id) {
        const session = await stripe().checkout.sessions.retrieve(order.stripe_checkout_session_id);
        if (session.payment_status === "paid") {
          await markOrderPaid(order, {
            method: "card",
            checkoutSessionId: session.id,
            paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
          });
          status = "paid";
        } else if (session.status === "open" && session.url) {
          checkoutUrl = session.url;
        } else if (session.status === "expired") {
          await cancelPendingOrder({ id: order.id, hold_id: order.hold_id, reason: "payment page expired" });
          status = "cancelled";
          message = "The payment page expired before anyone paid.";
        }
      } else if (order.stripe_payment_intent_id) {
        const intent = await stripe().paymentIntents.retrieve(order.stripe_payment_intent_id);
        if (intent.status === "succeeded") {
          await markOrderPaid(order, { method: "card", paymentIntentId: intent.id });
          status = "paid";
        } else if (intent.status === "canceled") {
          await cancelPendingOrder({ id: order.id, hold_id: order.hold_id });
          status = "cancelled";
        } else if (intent.last_payment_error) {
          message = intent.last_payment_error.message ?? "The card was declined. Try again or another card.";
        }
      } else {
        const intent = await findAppPaymentFor({
          collect_code: order.collect_code as string,
          created_at: order.created_at as string,
          subtotal_gbp: Number(order.subtotal_gbp ?? 0),
        });
        if (intent) {
          await markOrderPaid(order, { method: "card", paymentIntentId: intent.id });
          status = "paid";
        }
      }
    } catch (err) {
      console.error("Till status check against Stripe failed", err, collectCode);
    }
  }

  return { collectCode: collectCode.toUpperCase(), status, mode, totalGbp: Number(order.subtotal_gbp ?? 0), checkoutUrl, message };
}

// ---- Tap to Pay in the Stripe app -------------------------------------
//
// The Dashboard app creates its own PaymentIntent: card_present, no
// metadata of ours. Matching is by amount, then by the collect code staff
// typed into the payment's description; with several same-amount payments
// and no code, the oldest unclaimed one is taken, which is harmless since
// they are all real till payments of the same sum. Online payments are
// never candidates: they carry our order id and are not card_present.

/** How far before the order was opened a Tap to Pay payment may date from. */
const APP_MATCH_SLACK_S = 120;

type AppOrderKey = { collect_code: string; created_at: string; subtotal_gbp: number };

function isAppCandidate(pi: { status: string; currency: string; metadata?: Record<string, string> | null; payment_method_types: string[] }) {
  return pi.status === "succeeded" && pi.currency === "gbp" && !pi.metadata?.order_id && pi.payment_method_types.includes("card_present");
}

async function unclaimed<T extends { id: string }>(intents: T[]): Promise<T[]> {
  if (intents.length === 0) return intents;
  const { data: linked } = await fromPopup("popup_orders")
    .select("stripe_payment_intent_id")
    .in("stripe_payment_intent_id", intents.map((i) => i.id));
  const taken = new Set((linked ?? []).map((l) => l.stripe_payment_intent_id as string));
  return intents.filter((i) => !taken.has(i.id));
}

/** The till side: a pending Tap to Pay order looks for its payment on Stripe. */
export async function findAppPaymentFor(order: AppOrderKey) {
  const amount = Math.round(order.subtotal_gbp * 100);
  const since = Math.floor(new Date(order.created_at).getTime() / 1000) - APP_MATCH_SLACK_S;
  const list = await stripe().paymentIntents.list({ created: { gte: since }, limit: 100 });
  const free = await unclaimed(list.data.filter((pi) => isAppCandidate(pi) && pi.amount === amount));
  if (free.length === 0) return null;
  const code = order.collect_code.toUpperCase();
  const byCode = free.find((pi) => (pi.description ?? "").toUpperCase().includes(code));
  if (byCode) return byCode;
  return free.sort((a, b) => a.created - b.created)[0];
}

/**
 * The webhook side: a succeeded Tap to Pay payment looks for the pending
 * till order it settles. Returns whether one was marked paid.
 */
export async function claimAppPayment(intent: {
  id: string;
  status: string;
  amount: number;
  currency: string;
  created: number;
  description: string | null;
  metadata?: Record<string, string> | null;
  payment_method_types: string[];
}): Promise<boolean> {
  if (!isAppCandidate(intent)) return false;
  if ((await unclaimed([intent])).length === 0) return false;
  const notBefore = new Date((intent.created - 30 * 60) * 1000).toISOString();
  const { data: pending, error } = await fromPopup("popup_orders")
    .select("id, event_id, hold_id, collect_code, subtotal_gbp, created_at")
    .eq("source", "till")
    .eq("status", "pending_payment")
    .is("stripe_checkout_session_id", null)
    .is("stripe_payment_intent_id", null)
    .gte("created_at", notBefore)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const sameAmount = (pending ?? []).filter((o) => Math.round(Number(o.subtotal_gbp ?? 0) * 100) === intent.amount);
  if (sameAmount.length === 0) return false;
  const desc = (intent.description ?? "").toUpperCase();
  const order = sameAmount.find((o) => desc.includes((o.collect_code as string).toUpperCase())) ?? sameAmount[0];
  return markOrderPaid(
    { id: order.id as string, event_id: order.event_id as string, hold_id: order.hold_id as string | null },
    { method: "card", paymentIntentId: intent.id }
  );
}

/** Tells the reader to try the same PaymentIntent again after a decline. */
export async function retryTerminalPayment(collectCode: string): Promise<void> {
  const { data: order } = await fromPopup("popup_orders")
    .select("status, stripe_payment_intent_id")
    .eq("collect_code", collectCode.toUpperCase())
    .maybeSingle();
  if (!order || order.status !== "pending_payment" || !order.stripe_payment_intent_id) return;
  const location = process.env.STRIPE_TERMINAL_LOCATION_ID!;
  const readers = await stripe().terminal.readers.list({ location, status: "online", limit: 5 });
  const reader = readers.data[0];
  if (!reader) throw new Error("No card reader is online at this location.");
  await stripe().terminal.readers.processPaymentIntent(reader.id, { payment_intent: order.stripe_payment_intent_id });
}

/** Staff abandoned the sale: release the garments and stop any payment in flight. */
export async function cancelTillOrder(collectCode: string): Promise<boolean> {
  const { data: order, error } = await fromPopup("popup_orders")
    .select("id, hold_id, status, stripe_checkout_session_id, stripe_payment_intent_id")
    .eq("collect_code", collectCode.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!order) return false;
  const released = await cancelPendingOrder(order);
  if (released && order.stripe_payment_intent_id && !order.stripe_checkout_session_id) {
    try {
      if (terminalEnabled()) {
        const readers = await stripe().terminal.readers.list({ location: process.env.STRIPE_TERMINAL_LOCATION_ID!, limit: 5 });
        for (const r of readers.data) {
          if (r.action?.status === "in_progress") await stripe().terminal.readers.cancelAction(r.id);
        }
      }
      await stripe().paymentIntents.cancel(order.stripe_payment_intent_id);
    } catch (err) {
      console.warn("Could not cancel terminal payment", (err as Error).message, collectCode);
    }
  }
  return released;
}

export { UnitsUnavailableError };
