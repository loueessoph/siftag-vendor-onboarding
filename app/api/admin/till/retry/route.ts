import { NextRequest, NextResponse } from "next/server";
import { retryTerminalPayment } from "@/lib/till";
import { tillSession } from "../_auth";

/** POST { collectCode } — after a decline, send the same payment back to the card reader. */
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
    await retryTerminalPayment(code);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Till retry failed", err, code);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Retry failed" }, { status: 500 });
  }
}
