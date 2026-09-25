import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, homeFor, staffLinkValid, staffNames } from "@/lib/admin-auth";

/** The tap on a name: a 30-day staff session under that name, then the floor pages. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await request.formData();
  const name = String(form.get("name") ?? "");
  if (!(await staffLinkValid(token)) || !staffNames().includes(name)) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return NextResponse.redirect(new URL("/admin/login?error=1", request.url), 303);
  }
  const response = NextResponse.redirect(new URL(homeFor("staff"), request.url), 303);
  response.cookies.set(ADMIN_COOKIE, await createSessionToken({ role: "staff", name, email: null }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
