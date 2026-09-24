import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  homeFor,
  passwordMatches,
  staffMayVisit,
  staffPasswordMatches,
  type Session,
} from "@/lib/admin-auth";

/**
 * One password box. The shared admin password opens everything; a retail
 * assistant's own password (STAFF_PASSWORDS) opens the console and the till
 * under their name.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/admin");

  let who: Pick<Session, "role" | "name" | "email"> | null = null;
  if (passwordMatches(password)) {
    who = { role: "admin", name: "Admin", email: null };
  } else {
    const staffName = staffPasswordMatches(password);
    if (staffName) who = { role: "staff", name: staffName, email: null };
  }

  if (!who) {
    // Slow a brute force down a little without holding a connection open long.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return NextResponse.redirect(
      new URL(`/admin/login?error=1&next=${encodeURIComponent(next)}`, request.url)
    );
  }

  // Only ever redirect within this site — `next` comes from a query string.
  let destination = next.startsWith("/") ? next : "/admin";
  if (who.role === "staff" && !staffMayVisit(destination)) destination = homeFor("staff");
  if (destination === "/admin") destination = homeFor(who.role);

  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set(ADMIN_COOKIE, await createSessionToken(who), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
