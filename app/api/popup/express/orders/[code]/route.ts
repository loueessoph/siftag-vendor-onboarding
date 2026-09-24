import { NextResponse } from "next/server";
import { getOrderSummary } from "@/lib/express";

/**
 * Public (by collect code, not guessable): the confirmation/collect screen
 * polls this to flip from "pending payment" to "paid — show this at the
 * counter" once the Stripe webhook lands.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    const order = await getOrderSummary(code);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json(order, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Order lookup failed", err, code);
    return NextResponse.json({ error: "Failed to load order" }, { status: 500 });
  }
}
