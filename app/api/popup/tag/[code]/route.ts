import { NextResponse } from "next/server";
import { getTagDetail } from "@/lib/browse";

/** Public: what a shopper sees scanning the QR on a garment's tag. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    const detail = await getTagDetail(code);
    if (!detail) return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Tag lookup failed", err, code);
    return NextResponse.json({ error: "Failed to load tag" }, { status: 500 });
  }
}
