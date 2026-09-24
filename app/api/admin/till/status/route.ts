import { NextRequest, NextResponse } from "next/server";
import { tillOrderStatus } from "@/lib/till";
import { tillSession } from "../_auth";

/** GET /api/admin/till/status?code=… — polled by the till while a card payment is in flight. */
export async function GET(request: NextRequest) {
  const session = await tillSession(request);
  if (session instanceof NextResponse) return session;
  const code = request.nextUrl.searchParams.get("code") ?? "";
  try {
    const order = await tillOrderStatus(code);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json(order, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Till status failed", err, code);
    return NextResponse.json({ error: "Status check failed" }, { status: 500 });
  }
}
