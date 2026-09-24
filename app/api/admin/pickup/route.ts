import { NextRequest, NextResponse } from "next/server";
import { listPickups, pickupAction, type PickupAction } from "@/lib/pickup";
import { tillSession } from "../till/_auth";

const ACTIONS: PickupAction[] = ["take", "release", "packed", "unpacked", "collected"];

/** GET — the counter's queue. */
export async function GET(request: NextRequest) {
  const session = await tillSession(request);
  if (session instanceof NextResponse) return session;
  try {
    return NextResponse.json({ orders: await listPickups(), me: session.name }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Pickup list failed", err);
    return NextResponse.json({ error: "Could not load orders" }, { status: 500 });
  }
}

/** POST { collectCode, action } — take, release, packed, unpacked or collected. */
export async function POST(request: NextRequest) {
  const session = await tillSession(request);
  if (session instanceof NextResponse) return session;
  let body: { collectCode?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const code = typeof body.collectCode === "string" ? body.collectCode : "";
  const action = ACTIONS.includes(body.action as PickupAction) ? (body.action as PickupAction) : null;
  if (!code || !action) return NextResponse.json({ error: "Missing code or action" }, { status: 400 });
  try {
    const result = await pickupAction(code, action, session.name);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    console.error("Pickup action failed", err, code, action);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
