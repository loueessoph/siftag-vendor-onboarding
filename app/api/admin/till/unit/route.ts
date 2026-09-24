import { NextRequest, NextResponse } from "next/server";
import { lookupUnit } from "@/lib/till";
import { tillSession } from "../_auth";

/** GET /api/admin/till/unit?code=…  — what a scanned tag is and whether it can be sold. */
export async function GET(request: NextRequest) {
  const session = await tillSession(request);
  if (session instanceof NextResponse) return session;
  const code = request.nextUrl.searchParams.get("code") ?? "";
  try {
    const line = await lookupUnit(code);
    if (!line) return NextResponse.json({ error: "No garment with that code" }, { status: 404 });
    return NextResponse.json(line, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Till lookup failed", err, code);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
