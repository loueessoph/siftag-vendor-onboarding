import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin-auth";

/**
 * Everything under /admin needs a valid session, except the login page itself
 * and the endpoint that creates the session. Vendor routes are deliberately
 * not covered — they authenticate by token in the path, server-side.
 *
 * Named `proxy` rather than `middleware`: Next 16 deprecated the middleware
 * filename and export.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const valid = await verifySessionToken(
    request.cookies.get(ADMIN_COOKIE)?.value
  );
  if (valid) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
