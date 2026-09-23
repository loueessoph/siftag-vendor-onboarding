import { NextRequest, NextResponse } from "next/server";
import { fromPopup, supabaseAdmin } from "@/lib/supabase/server";
import { verifyShopifyWebhook } from "@/lib/shopify-client";
import { finalizePaidOrder } from "@/lib/express";

/**
 * Shopify webhook target: Admin > Settings > Notifications > Webhooks,
 * topic "Draft order update", format JSON. A draft order flips to status
 * "completed" the moment the buyer pays through its invoice URL — that's
 * the signal that turns held units into sold ones.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");

  if (!verifyShopifyWebhook(rawBody, hmac)) {
    console.error("Shopify webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { id: number; status: string; order_id: number | null };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (payload.status !== "completed") {
    return NextResponse.json({ ok: true, skipped: "not completed yet" });
  }

  const db = supabaseAdmin();
  const draftOrderId = String(payload.id);

  const { data: order, error } = await fromPopup("popup_orders")
    .select("id, event_id, hold_id, status")
    .eq("shopify_draft_order_id", draftOrderId)
    .maybeSingle();
  if (error) {
    console.error("Order lookup failed for webhook", error, draftOrderId);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!order) {
    console.error("Webhook for unknown draft order", draftOrderId);
    return NextResponse.json({ ok: true, skipped: "unknown draft order" });
  }
  if (order.status !== "pending_payment") {
    return NextResponse.json({ ok: true, skipped: "already processed" });
  }

  try {
    await finalizePaidOrder(order);
    await db
      .from("popup_orders")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        shopify_order_id: payload.order_id ? String(payload.order_id) : null,
      })
      .eq("id", order.id);
  } catch (err) {
    console.error("Failed to finalize paid order", err, order.id);
    return NextResponse.json({ error: "Failed to finalize order" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
