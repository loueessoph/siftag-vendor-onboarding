import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  createSessionToken,
  passwordMatches,
} from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/admin");

  if (!passwordMatches(password)) {
    // Slow a brute force down a little without holding a connection open long.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return NextResponse.redirect(
      new URL(`/admin/login?error=1&next=${encodeURIComponent(next)}`, request.url)
    );
  }

  // Only ever redirect within this site — `next` comes from a query string.
  const destination = next.startsWith("/") ? next : "/admin";
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set(ADMIN_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 3600,
  });
  return response;
}
