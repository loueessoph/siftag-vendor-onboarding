import { NextResponse } from "next/server";
import { getBrowseCatalogue } from "@/lib/browse";

/** Public: the full pop-up catalogue for the browse-all page. */
export async function GET() {
  try {
    const products = await getBrowseCatalogue();
    return NextResponse.json({ products }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Catalogue load failed", err);
    return NextResponse.json({ error: "Failed to load catalogue" }, { status: 500 });
  }
}
