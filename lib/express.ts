/**
 * Express checkout: pay now, skip the line, collect at the counter. Ported
 * from lib/popup/express.ts on the Siftag-Popup branch of the main siftag
 * repo, adapted to fromPopup()/supabaseAdmin() instead of a passed-in
 * client.
 */

import { fromPopup, supabaseAdmin } from "./supabase/server";

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
      changed_by: "customer",
      note: "express checkout pending payment",
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

/** Line-item detail for the units in a hold, used both for the Shopify draft order and the order summary. */
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
 * Called from the Shopify webhook once a draft order is paid: converts the
 * held units to 'sold' and writes the settlement-facing order_items. Safe
 * to call twice for the same order (no-ops if items already exist).
 */
export async function finalizePaidOrder(order: { id: string; event_id: string; hold_id: string | null }) {
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
      changed_by: "system",
      note: "express payment confirmed",
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

export type OrderSummary = {
  collect_code: string;
  order_type: "express" | "reserve_collect";
  status: "pending_payment" | "paid" | "collected" | "uncollected" | "cancelled";
  subtotal_gbp: number | null;
  shopify_invoice_url: string | null;
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
    subtotal_gbp: order.subtotal_gbp,
    shopify_invoice_url: order.shopify_invoice_url,
    items,
    created_at: order.created_at,
    paid_at: order.paid_at,
    collected_at: order.collected_at,
  };
}
