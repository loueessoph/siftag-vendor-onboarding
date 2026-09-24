import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, homeFor, staffMayVisit, verifySessionToken } from "@/lib/admin-auth";

/**
 * Everything under /admin needs a valid session, except the login page itself
 * and the endpoint that creates the session. A 'staff' session is further
 * confined to the floor console and the till (see staffMayVisit); anything
 * else sends it back to the console. Vendor routes are deliberately not
 * covered — they authenticate by token in the path, server-side.
 *
 * Named `proxy` rather than `middleware`: Next 16 deprecated the middleware
 * filename and export.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const session = await verifySessionToken(
    request.cookies.get(ADMIN_COOKIE)?.value
  );
  if (session) {
    if (session.role === "staff" && !staffMayVisit(pathname)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Staff accounts can't do that" }, { status: 403 });
      }
      const url = request.nextUrl.clone();
      url.pathname = homeFor("staff");
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
