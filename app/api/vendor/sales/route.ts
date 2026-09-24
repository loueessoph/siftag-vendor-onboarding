import { NextRequest, NextResponse } from "next/server";
import { getVendorByToken } from "@/lib/vendor";
import { getVendorSalesReport, salesCsv } from "@/lib/vendor-sales";

/** GET /api/vendor/sales?token=… — the brand's sales as a CSV, authorised by their private token like every vendor route. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const context = token ? await getVendorByToken(token) : null;
  if (!context) return NextResponse.json({ error: "Unknown link" }, { status: 404 });
  try {
    const report = await getVendorSalesReport(context.brand.id);
    const csv = salesCsv(context.brand.name, report.recent);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="siftag-popup-sales-${context.brand.slug}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Sales CSV failed", err, context.brand.id);
    return NextResponse.json({ error: "Could not build the report" }, { status: 500 });
  }
}
