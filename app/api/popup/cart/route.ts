import { NextRequest, NextResponse } from "next/server";
import { fromPopup } from "@/lib/supabase/server";
import { getActiveEvent, releaseExpiredHolds } from "@/lib/live-event";

/**
 * POST { codes: string[] } — live status for the garments in a shopper's
 * bag, so the bag page can flag anything that sold while they browsed. The
 * bag itself lives in the browser; nothing is held until checkout.
 */
export async function POST(request: NextRequest) {
  let body: { codes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const codes = Array.isArray(body.codes)
    ? [...new Set(body.codes.filter((c): c is string => typeof c === "string").map((c) => c.toUpperCase()))].slice(0, 30)
    : [];
  if (codes.length === 0) return NextResponse.json({ statuses: {} });
  try {
    const event = await getActiveEvent();
    await releaseExpiredHolds(event.id);
    const { data, error } = await fromPopup("popup_units").select("unit_code, status").in("unit_code", codes);
    if (error) throw error;
    const statuses: Record<string, string> = {};
    for (const u of data ?? []) statuses[u.unit_code as string] = u.status as string;
    return NextResponse.json({ statuses }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Cart status failed", err);
    return NextResponse.json({ error: "Status check failed" }, { status: 500 });
  }
}
