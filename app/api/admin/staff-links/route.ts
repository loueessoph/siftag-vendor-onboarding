import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, staffLinkToken, staffNames, verifySessionToken } from "@/lib/admin-auth";

/**
 * Each retail assistant's private sign-in link, computed with this
 * deployment's own secret so they are always the ones that work here.
 * Admin only: a staff session must not see the others' links.
 */
export async function GET(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
  const links: Record<string, string> = {};
  for (const name of staffNames()) links[name] = `${origin}/staff/${await staffLinkToken(name)}`;
  return NextResponse.json({ links }, { headers: { "Cache-Control": "no-store" } });
}
