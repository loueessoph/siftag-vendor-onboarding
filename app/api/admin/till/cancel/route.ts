import { NextRequest, NextResponse } from "next/server";
import { cancelTillOrder } from "@/lib/till";
import { tillSession } from "../_auth";

/** POST { collectCode } — abandon a pending sale: garments back on the floor, payment stopped. */
export async function POST(request: NextRequest) {
  const session = await tillSession(request);
  if (session instanceof NextResponse) return session;
  let body: { collectCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const code = typeof body.collectCode === "string" ? body.collectCode : "";
  try {
    const released = await cancelTillOrder(code);
    return NextResponse.json({ ok: true, released });
  } catch (err) {
    console.error("Till cancel failed", err, code);
    return NextResponse.json({ error: "Cancel failed" }, { status: 500 });
  }
}
