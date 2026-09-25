import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, homeFor, staffNameForLinkToken } from "@/lib/admin-auth";

/**
 * A retail assistant's private link: /staff/<token>. Opening it signs them
 * in under their name for the whole event and lands them on the floor
 * staff pages. Outside /admin so the proxy never asks for a password first.
 * A bad token goes to the login page, which still works as the fallback.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const name = await staffNameForLinkToken(token);
  if (!name) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return NextResponse.redirect(new URL("/admin/login?error=1", request.url));
  }
  const response = NextResponse.redirect(new URL(homeFor("staff"), request.url));
  response.cookies.set(ADMIN_COOKIE, await createSessionToken({ role: "staff", name, email: null }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
