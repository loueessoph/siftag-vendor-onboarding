import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, staffLinkToken, verifySessionToken } from "@/lib/admin-auth";

/**
 * The floor team's sign-in link, computed with this deployment's own secret
 * so it is always the one that works here. Admin only.
 */
export async function GET(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
  return NextResponse.json({ link: `${origin}/staff/${await staffLinkToken()}` }, { headers: { "Cache-Control": "no-store" } });
}
