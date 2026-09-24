import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { fromPopup } from "@/lib/supabase/server";
import { listTagUnits, renderTagsPdf } from "@/lib/tags";

/**
 * GET /api/admin/tags?brandId=…   one brand's tags
 * GET /api/admin/tags             every brand, a fresh sheet per brand
 *
 * proxy.ts already turns away anyone without an admin session before this
 * runs; the check here is a second lock in case the matcher ever changes.
 */
export async function GET(request: NextRequest) {
  if (!(await verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const brandId = request.nextUrl.searchParams.get("brandId") ?? undefined;
  let filename = "siftag-tags-all-brands.pdf";
  if (brandId) {
    const { data: brand, error } = await fromPopup("popup_brands").select("slug").eq("id", brandId).maybeSingle();
    if (error) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    filename = `siftag-tags-${brand.slug}.pdf`;
  }

  try {
    const tags = await listTagUnits(brandId);
    const pdf = await renderTagsPdf(tags);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Tag-Count": String(tags.length),
      },
    });
  } catch (err) {
    console.error("Tag PDF failed", err, brandId);
    return NextResponse.json({ error: "Could not build the tag PDF" }, { status: 500 });
  }
}
