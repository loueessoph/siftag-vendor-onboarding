import { NextRequest, NextResponse } from "next/server";
import { anotherUnit } from "@/lib/till";
import { tillSession } from "../_auth";

/** POST { unitCode, exclude[] } — one more tag of the same product, size and colour for the basket. */
export async function POST(request: NextRequest) {
  const session = await tillSession(request);
  if (session instanceof NextResponse) return session;
  let body: { unitCode?: unknown; exclude?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const unitCode = typeof body.unitCode === "string" ? body.unitCode : "";
  const exclude = Array.isArray(body.exclude) ? body.exclude.filter((c): c is string => typeof c === "string") : [];
  try {
    const line = await anotherUnit(unitCode, exclude);
    if (!line) return NextResponse.json({ error: "No garment with that code" }, { status: 404 });
    return NextResponse.json(line);
  } catch (err) {
    console.error("Till 'another' failed", err, unitCode);
    return NextResponse.json({ error: "Couldn't add another" }, { status: 500 });
  }
}
