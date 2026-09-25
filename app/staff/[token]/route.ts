import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, SESSION_MAX_AGE_SECONDS, STAFF_LINK_NAME, createSessionToken, homeFor, staffLinkValid } from "@/lib/admin-auth";

/**
 * The floor team's one link: /staff/<token>. Opening it signs the phone in
 * as floor staff for the whole event and lands on the staff pages, nothing
 * to type. Outside /admin so the proxy never asks for a password first. A
 * bad token goes to the login page, which still works as the fallback.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await staffLinkValid(token))) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return NextResponse.redirect(new URL("/admin/login?error=1", request.url));
  }
  const response = NextResponse.redirect(new URL(homeFor("staff"), request.url));
  response.cookies.set(ADMIN_COOKIE, await createSessionToken({ role: "staff", name: STAFF_LINK_NAME, email: null }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
