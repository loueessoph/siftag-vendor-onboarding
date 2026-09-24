import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, verifySessionToken, type Session } from "@/lib/admin-auth";

/** proxy.ts already gates /api/admin/till; this repeats the check so the route can't be reached without it and knows who is at the till. */
export async function tillSession(request: NextRequest): Promise<Session | NextResponse> {
  const session = await verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value);
  return session ?? NextResponse.json({ error: "Unauthorised" }, { status: 401 });
}
