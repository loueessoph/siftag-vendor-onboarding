import { NextRequest, NextResponse } from "next/server";
import { fromPopup } from "@/lib/supabase/server";
import { cancelPendingOrder } from "@/lib/express";

/**
 * The shopper backed out of Stripe's payment page. Stripe only tells us
 * when the session expires, half an hour on, and until then their items
 * would sit held and un-buyable, including by them. So the basket page
 * calls this on the way back to release everything straight away.
 */
export async function POST(request: NextRequest) {
  let body: { collectCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const collectCode = typeof body.collectCode === "string" ? body.collectCode.trim().toUpperCase() : "";
  if (!collectCode) return NextResponse.json({ error: "Missing collect code" }, { status: 400 });

  try {
    const { data: order, error } = await fromPopup("popup_orders")
      .select("id, hold_id, status, stripe_checkout_session_id")
      .eq("collect_code", collectCode)
      .maybeSingle();
    if (error) throw error;
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const released = await cancelPendingOrder(order);
    return NextResponse.json({ ok: true, released });
  } catch (err) {
    console.error("Express cancel failed", err, collectCode);
    return NextResponse.json({ error: "Cancel failed" }, { status: 500 });
  }
}
