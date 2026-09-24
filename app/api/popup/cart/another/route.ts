import { NextRequest, NextResponse } from "next/server";
import { findSpareUnit } from "@/lib/browse";

/** POST { unitCode, exclude[] } — another garment of the same product and size for the bag, or 404 when none is left. */
export async function POST(request: NextRequest) {
  let body: { unitCode?: unknown; exclude?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const unitCode = typeof body.unitCode === "string" ? body.unitCode : "";
  const exclude = Array.isArray(body.exclude) ? body.exclude.filter((c): c is string => typeof c === "string") : [];
  if (!unitCode) return NextResponse.json({ error: "Missing code" }, { status: 400 });
  try {
    const spare = await findSpareUnit(unitCode, exclude);
    if (!spare) return NextResponse.json({ error: "No more of that size in stock" }, { status: 404 });
    return NextResponse.json(spare, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Spare unit lookup failed", err, unitCode);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
