/**
 * The Express counter's queue: online orders that are paid and not yet
 * collected. A member of staff takes an order (so nobody else does), marks
 * it packed, then confirms the handover by the customer's collect code,
 * scanned from their confirm page or typed in.
 */

import { fromPopup, supabaseAdmin } from "./supabase/server";
import { getUnitsLineItems } from "./express";

export type PickupOrder = {
  collectCode: string;
  status: "paid" | "collected";
  paidAt: string | null;
  collectedAt: string | null;
  customer: { name: string | null; email: string | null; phone: string | null };
  totalGbp: number;
  handler: string | null;
  takenAt: string | null;
  packedAt: string | null;
  items: Array<{ unitCode: string; productTitle: string; brandName: string; size: string | null }>;
};

export async function listPickups(): Promise<PickupOrder[]> {
  const { data: orders, error } = await fromPopup("popup_orders")
    .select("id, collect_code, status, paid_at, collected_at, subtotal_gbp, pickup_handler, pickup_taken_at, packed_at, popup_customers(name, email, phone)")
    .eq("source", "express")
    .in("status", ["paid", "collected"])
    .order("paid_at", { ascending: true });
  if (error) throw error;

  const ids = (orders ?? []).map((o) => o.id as string);
  const { data: items } = ids.length
    ? await fromPopup("popup_order_items").select("order_id, popup_unit_id").in("order_id", ids)
    : { data: [] as Array<{ order_id: string; popup_unit_id: string }> };
  const lines = await getUnitsLineItems((items ?? []).map((i) => i.popup_unit_id as string));
  const lineByUnit = new Map(lines.map((l) => [l.unitId, l]));
  const itemsByOrder = new Map<string, PickupOrder["items"]>();
  for (const it of items ?? []) {
    const l = lineByUnit.get(it.popup_unit_id as string);
    if (!l) continue;
    const list = itemsByOrder.get(it.order_id as string) ?? [];
    list.push({ unitCode: l.unitCode, productTitle: l.productTitle, brandName: l.brandName, size: l.size });
    itemsByOrder.set(it.order_id as string, list);
  }

  // Collected orders stay in the list for two hours so a "did we hand that
  // over?" question can be answered from the counter, then drop away.
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  return (orders ?? [])
    .filter((o) => o.status === "paid" || (o.collected_at && new Date(o.collected_at as string).getTime() > cutoff))
    .map((o) => {
      const c = o.popup_customers as unknown as { name: string | null; email: string | null; phone: string | null } | null;
      return {
        collectCode: o.collect_code as string,
        status: o.status as "paid" | "collected",
        paidAt: o.paid_at as string | null,
        collectedAt: o.collected_at as string | null,
        customer: { name: c?.name ?? null, email: c?.email ?? null, phone: c?.phone ?? null },
        totalGbp: Number(o.subtotal_gbp ?? 0),
        handler: (o.pickup_handler as string | null) ?? null,
        takenAt: (o.pickup_taken_at as string | null) ?? null,
        packedAt: (o.packed_at as string | null) ?? null,
        items: itemsByOrder.get(o.id as string) ?? [],
      };
    });
}

export type PickupAction = "take" | "release" | "packed" | "unpacked" | "collected";

/** One counter action on one order. Returns a message for the operator when something is off. */
export async function pickupAction(collectCode: string, action: PickupAction, staffName: string): Promise<{ ok: boolean; message?: string }> {
  const db = supabaseAdmin();
  const code = collectCode.trim().toUpperCase();
  const { data: order, error } = await fromPopup("popup_orders")
    .select("id, status, source, pickup_handler, packed_at")
    .eq("collect_code", code)
    .maybeSingle();
  if (error) throw error;
  if (!order) return { ok: false, message: "No order with that code." };
  if (order.source !== "express") return { ok: false, message: "That's a counter sale, not an online order." };
  if (order.status === "collected" && action !== "release") return { ok: false, message: "Already collected." };
  if (order.status !== "paid" && order.status !== "collected") return { ok: false, message: `Order is ${String(order.status).replace("_", " ")}, not ready to collect.` };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  switch (action) {
    case "take":
      if (order.pickup_handler && order.pickup_handler !== staffName) return { ok: false, message: `${order.pickup_handler} already has this one.` };
      patch.pickup_handler = staffName;
      patch.pickup_taken_at = now;
      break;
    case "release":
      patch.pickup_handler = null;
      patch.pickup_taken_at = null;
      patch.packed_at = null;
      break;
    case "packed":
      patch.packed_at = now;
      if (!order.pickup_handler) {
        patch.pickup_handler = staffName;
        patch.pickup_taken_at = now;
      }
      break;
    case "unpacked":
      patch.packed_at = null;
      break;
    case "collected":
      patch.status = "collected";
      patch.collected_at = now;
      if (!order.pickup_handler) patch.pickup_handler = staffName;
      break;
  }
  const { error: upErr } = await db.from("popup_orders").update(patch).eq("id", order.id);
  if (upErr) throw upErr;
  return { ok: true };
}
