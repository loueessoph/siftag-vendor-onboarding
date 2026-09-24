import { NextRequest, NextResponse } from "next/server";
import { openTillOrder, UnitsUnavailableError, type TillMode } from "@/lib/till";
import { tillSession } from "../_auth";

const MAX_ITEMS = 20;
// The pop-up is card only. The cash path in lib/till.ts stays for the day
// that changes, but the till can't reach it.
const MODES: TillMode[] = ["terminal", "qr"];

/** POST { unitCodes, mode, email? } — claims the basket and starts payment. */
export async function POST(request: NextRequest) {
  const session = await tillSession(request);
  if (session instanceof NextResponse) return session;

  let body: { unitCodes?: unknown; mode?: unknown; email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const unitCodes = Array.isArray(body.unitCodes)
    ? [...new Set(body.unitCodes.filter((c): c is string => typeof c === "string" && c.trim().length > 0).map((c) => c.trim().toUpperCase()))]
    : [];
  if (unitCodes.length === 0) return NextResponse.json({ error: "Scan at least one item" }, { status: 400 });
  if (unitCodes.length > MAX_ITEMS) return NextResponse.json({ error: `Max ${MAX_ITEMS} items per sale` }, { status: 400 });
  const mode = MODES.includes(body.mode as TillMode) ? (body.mode as TillMode) : null;
  if (!mode) return NextResponse.json({ error: "Choose how they're paying" }, { status: 400 });
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : undefined;

  try {
    const order = await openTillOrder({ unitCodes, mode, staffName: session.name, email });
    return NextResponse.json(order);
  } catch (err) {
    if (err instanceof UnitsUnavailableError) {
      return NextResponse.json({ error: "just_missed_it", unavailableCodes: err.unavailableCodes }, { status: 409 });
    }
    console.error("Till checkout failed", err);
    const message = err instanceof Error ? err.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
