/**
 * Express checkout: pay now, skip the line, collect at the counter. Ported
 * from lib/popup/express.ts on the Siftag-Popup branch of the main siftag
 * repo, adapted to fromPopup()/supabaseAdmin() instead of a passed-in
 * client.
 */

import { fromPopup, supabaseAdmin } from "./supabase/server";
import { expireCheckoutSession, openCheckoutUrl } from "./stripe";

export class UnitsUnavailableError extends Error {
  constructor(public unavailableCodes: string[]) {
    super(`Some items were just taken: ${unavailableCodes.join(", ")}`);
  }
}

/**
 * Atomically claims a set of units for checkout: one SQL UPDATE flips only
 * the rows still 'available' to 'held' under a fresh express_pending hold.
 * If the returned row count is short (someone else's checkout beat us to a
 * unit), everything claimed is rolled back and the caller sees exactly
 * which codes were lost — "just missed it" rather than a partial order.
 */
export async function claimUnitsForCheckout(params: {
  eventId: string;
  unitCodes: string[];
  holdMinutes: number;
  /** Written to popup_unit_events.changed_by: "customer" for the express flow, the staff name at the till. */
  changedBy?: string;
  note?: string;
}) {
  const db = supabaseAdmin();
  const codes = params.unitCodes.map((c) => c.toUpperCase());

  const { data: units, error: unitsError } = await fromPopup("popup_units")
    .select("id, unit_code, status, popup_variant_id")
    .in("unit_code", codes);
  if (unitsError) throw unitsError;

  const foundCodes = new Set((units ?? []).map((u) => u.unit_code));
  const missing = codes.filter((c) => !foundCodes.has(c));
  if (missing.length > 0) throw new UnitsUnavailableError(missing);

  const { data: hold, error: holdError } = await db
    .from("popup_holds")
    .insert({
      event_id: params.eventId,
      hold_type: "express_pending",
      status: "active",
      expires_at: new Date(Date.now() + params.holdMinutes * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (holdError) throw holdError;

  const unitIds = (units ?? []).map((u) => u.id);
  const { data: claimed, error: claimError } = await db
    .from("popup_units")
    .update({ status: "held", hold_id: hold.id, updated_at: new Date().toISOString() })
    .in("id", unitIds)
    .eq("status", "available")
    .select("id, unit_code");
  if (claimError) throw claimError;

  if ((claimed?.length ?? 0) < unitIds.length) {
    const claimedIds = (claimed ?? []).map((u) => u.id);
    if (claimedIds.length > 0) {
      await db.from("popup_units").update({ status: "available", hold_id: null }).in("id", claimedIds);
    }
    await db.from("popup_holds").update({ status: "released", released_at: new Date().toISOString() }).eq("id", hold.id);
    const claimedCodes = new Set((claimed ?? []).map((u) => u.unit_code));
    const lostCodes = codes.filter((c) => !claimedCodes.has(c));
    throw new UnitsUnavailableError(lostCodes);
  }

  for (const unit of claimed ?? []) {
    await db.from("popup_unit_events").insert({
      popup_unit_id: unit.id,
      event_id: params.eventId,
      from_status: "available",
      to_status: "held",
      changed_by: params.changedBy ?? "customer",
      note: params.note ?? "express checkout pending payment",
    });
  }

  return { holdId: hold.id as string, unitIds };
}

export async function upsertCustomer(params: { phone?: string; email?: string; name?: string }) {
  const db = supabaseAdmin();
  const phone = params.phone?.trim() || null;
  const email = params.email?.trim().toLowerCase() || null;
  if (!phone && !email) throw new Error("A phone or email is required");

  const existingQuery = fromPopup("popup_customers").select("id");
  const { data: existing } = phone
    ? await existingQuery.eq("phone", phone).maybeSingle()
    : await existingQuery.eq("email", email!).maybeSingle();

  if (existing) return existing.id as string;

  const { data: created, error } = await db
    .from("popup_customers")
    .insert({ phone, email, name: params.name?.trim() || null })
    .select("id")
    .single();
  if (error) throw error;
  return created.id as string;
}

/** Line-item detail for the units in a hold, used both for the Stripe Checkout Session and the order summary. */
export async function getUnitsLineItems(unitIds: string[]) {
  const { data: units, error: unitsError } = await fromPopup("popup_units")
    .select("id, unit_code, popup_variant_id")
    .in("id", unitIds);
  if (unitsError) throw unitsError;

  const variantIds = (units ?? []).map((u) => u.popup_variant_id);
  const { data: variants, error: variantsError } = await fromPopup("popup_variants")
    .select("id, size, popup_price, online_price, popup_product_id")
    .in("id", variantIds);
  if (variantsError) throw variantsError;

  const productIds = [...new Set((variants ?? []).map((v) => v.popup_product_id))];
  const { data: products, error: productsError } = await fromPopup("popup_products")
    .select("id, title, popup_brand_id")
    .in("id", productIds);
  if (productsError) throw productsError;

  const brandIds = [...new Set((products ?? []).map((p) => p.popup_brand_id))];
  const { data: brands, error: brandsError } = await fromPopup("popup_brands")
    .select("id, name")
    .in("id", brandIds);
  if (brandsError) throw brandsError;

  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));
  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const brandById = new Map((brands ?? []).map((b) => [b.id, b]));

  return (units ?? []).map((u) => {
    const variant = variantById.get(u.popup_variant_id)!;
    const product = productById.get(variant.popup_product_id)!;
    const brand = brandById.get(product.popup_brand_id)!;
    const price = Number(variant.popup_price ?? variant.online_price ?? 0);
    return {
      unitId: u.id as string,
      unitCode: u.unit_code as string,
      size: variant.size as string | null,
      priceGbp: price,
      productTitle: product.title as string,
      brandId: product.popup_brand_id as string,
      brandName: brand.name as string,
    };
  });
}

/**
 * Called from the Stripe webhook once a Checkout Session is paid (and by
 * the till for cash): converts the held units to 'sold' and writes the
 * settlement-facing order_items. Safe to call twice for the same order
 * (no-ops if items already exist).
 */
export async function finalizePaidOrder(
  order: { id: string; event_id: string; hold_id: string | null },
  by: { changedBy?: string; note?: string } = {}
) {
  const db = supabaseAdmin();
  const { data: existingItems } = await fromPopup("popup_order_items").select("id").eq("order_id", order.id).limit(1);
  if (existingItems && existingItems.length > 0) return; // already finalized

  if (!order.hold_id) throw new Error(`Order ${order.id} has no hold_id to finalize from`);

  const { data: units, error: unitsError } = await fromPopup("popup_units")
    .select("id, status")
    .eq("hold_id", order.hold_id);
  if (unitsError) throw unitsError;

  const lineItems = await getUnitsLineItems((units ?? []).map((u) => u.id));

  for (const li of lineItems) {
    await db
      .from("popup_units")
      .update({ status: "sold", hold_id: null, updated_at: new Date().toISOString() })
      .eq("id", li.unitId);
    await db.from("popup_unit_events").insert({
      popup_unit_id: li.unitId,
      event_id: order.event_id,
      from_status: "held",
      to_status: "sold",
      changed_by: by.changedBy ?? "system",
      note: by.note ?? "payment confirmed",
    });
    await db.from("popup_order_items").insert({
      order_id: order.id,
      popup_unit_id: li.unitId,
      popup_brand_id: li.brandId,
      price_gbp: li.priceGbp,
    });
  }

  await db.from("popup_holds").update({ status: "converted", released_at: new Date().toISOString() }).eq("id", order.hold_id);
}

export type PaidVia =
  | { method: "card"; checkoutSessionId?: string | null; paymentIntentId?: string | null }
  | { method: "cash"; changedBy: string };

/**
 * The one place an order becomes paid: the Stripe webhook, the till's
 * reconciliation poll and the cash button all come through here. Claims the
 * order with a conditional update so two callers can't both finalise it,
 * then sells the units. Returns false when the order was no longer pending.
 * If selling the units throws, the order is put back so the caller (or
 * Stripe's retry) can try again.
 */
export async function markOrderPaid(
  order: { id: string; event_id: string; hold_id: string | null },
  via: PaidVia
): Promise<boolean> {
  const db = supabaseAdmin();
  const stripeIds =
    via.method === "card"
      ? {
          ...(via.checkoutSessionId ? { stripe_checkout_session_id: via.checkoutSessionId } : {}),
          ...(via.paymentIntentId ? { stripe_payment_intent_id: via.paymentIntentId } : {}),
        }
      : {};
  const { data: claimed, error } = await db
    .from("popup_orders")
    .update({ status: "paid", paid_at: new Date().toISOString(), payment_method: via.method, ...stripeIds })
    .eq("id", order.id)
    .eq("status", "pending_payment")
    .select("id");
  if (error) throw error;
  if (!claimed || claimed.length === 0) return false;

  try {
    await finalizePaidOrder(
      order,
      via.method === "cash" ? { changedBy: via.changedBy, note: "paid in cash at the till" } : {}
    );
  } catch (err) {
    await db.from("popup_orders").update({ status: "pending_payment", paid_at: null }).eq("id", order.id);
    throw err;
  }
  return true;
}

/**
 * Undoes a pending order: units go back on the floor, the hold is released,
 * the order is cancelled and any open Stripe session is expired so it can't
 * be paid afterwards. Used when the payment page fails to open, when the
 * shopper backs out of it, and when Stripe reports the session expired.
 * A no-op for an order that is no longer pending.
 */
export async function cancelPendingOrder(order: {
  id: string;
  hold_id: string | null;
  stripe_checkout_session_id?: string | null;
  /** Written to the unit events, e.g. "payment page expired". */
  reason?: string;
}): Promise<boolean> {
  const db = supabaseAdmin();
  const nowIso = new Date().toISOString();

  // Atomic: only one caller gets to cancel, so the webhook and the shopper's
  // own cancel can't both release the same units.
  const { data: cancelled, error } = await db
    .from("popup_orders")
    .update({ status: "cancelled" })
    .eq("id", order.id)
    .eq("status", "pending_payment")
    .select("id");
  if (error) throw error;
  if (!cancelled || cancelled.length === 0) return false;

  if (order.hold_id) {
    const { data: units } = await fromPopup("popup_units")
      .select("id, event_id")
      .eq("hold_id", order.hold_id)
      .eq("status", "held");
    const unitIds = (units ?? []).map((u) => u.id as string);
    if (unitIds.length > 0) {
      await db
        .from("popup_units")
        .update({ status: "available", hold_id: null, updated_at: nowIso })
        .in("id", unitIds);
      // Keep the audit trail symmetrical with the 'held' event the claim wrote.
      await db.from("popup_unit_events").insert(
        (units ?? []).map((u) => ({
          popup_unit_id: u.id,
          event_id: u.event_id,
          from_status: "held",
          to_status: "available",
          changed_by: "system",
          note: order.reason ?? "order cancelled",
        }))
      );
    }
    await db
      .from("popup_holds")
      .update({ status: "released", released_at: nowIso })
      .eq("id", order.hold_id)
      .eq("status", "active");
  }

  if (order.stripe_checkout_session_id) await expireCheckoutSession(order.stripe_checkout_session_id);
  return true;
}

export type OrderSummary = {
  collect_code: string;
  order_type: "express" | "reserve_collect";
  status: "pending_payment" | "paid" | "collected" | "uncollected" | "cancelled";
  source: "express" | "till";
  payment_method: "card" | "cash" | null;
  subtotal_gbp: number | null;
  /** Stripe's hosted payment page, only while the order is still awaiting payment. */
  checkout_url: string | null;
  items: Array<{ unit_code: string; product_title: string; brand_name: string; size: string | null; price_gbp: number }>;
  created_at: string;
  paid_at: string | null;
  collected_at: string | null;
};

export async function getOrderSummary(collectCode: string): Promise<OrderSummary | null> {
  const { data: order, error } = await fromPopup("popup_orders")
    .select("*")
    .eq("collect_code", collectCode.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  let items: OrderSummary["items"] = [];
  if (order.status === "pending_payment" && order.hold_id) {
    const { data: heldUnits } = await fromPopup("popup_units").select("id").eq("hold_id", order.hold_id);
    const lineItems = await getUnitsLineItems((heldUnits ?? []).map((u) => u.id));
    items = lineItems.map((li) => ({
      unit_code: li.unitCode,
      product_title: li.productTitle,
      brand_name: li.brandName,
      size: li.size,
      price_gbp: li.priceGbp,
    }));
  } else {
    const { data: orderItems, error: itemsError } = await fromPopup("popup_order_items")
      .select("popup_unit_id")
      .eq("order_id", order.id);
    if (itemsError) throw itemsError;
    const lineItems = await getUnitsLineItems((orderItems ?? []).map((oi: { popup_unit_id: string }) => oi.popup_unit_id));
    items = lineItems.map((li) => ({
      unit_code: li.unitCode,
      product_title: li.productTitle,
      brand_name: li.brandName,
      size: li.size,
      price_gbp: li.priceGbp,
    }));
  }

  return {
    collect_code: order.collect_code,
    order_type: order.order_type,
    status: order.status,
    // popup_orders.subtotal_gbp is a Postgres `numeric` column — PostgREST
    // serializes those as strings (to avoid float precision loss), not the
    // `number` this type promises, so unwrapped this crashes the confirm
    // page's `.toFixed(2)` calls. Same normalization getUnitsLineItems
    // already does for price_gbp.
    subtotal_gbp: order.subtotal_gbp === null ? null : Number(order.subtotal_gbp),
    source: order.source ?? "express",
    payment_method: order.payment_method ?? null,
    checkout_url:
      order.status === "pending_payment" && order.stripe_checkout_session_id
        ? await openCheckoutUrl(order.stripe_checkout_session_id)
        : null,
    items,
    created_at: order.created_at,
    paid_at: order.paid_at,
    collected_at: order.collected_at,
  };
}
