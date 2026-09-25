import { NextRequest, NextResponse } from "next/server";
import { tillSession } from "../../till/_auth";
import { send } from "@/lib/email";

/**
 * Is this deployment able to send email? Reports the login address, the
 * From address and a fingerprint of the app password (length, spaces,
 * first and last character), never the password itself, so a value pasted
 * wrongly into Vercel can be spotted. With ?test=1 it also sends a test
 * message to the login address and reports what Gmail said.
 */
export async function GET(request: NextRequest) {
  const session = await tillSession(request);
  if (session instanceof NextResponse) return session;
  const user = process.env.GMAIL_USER ?? null;
  const pass = process.env.GMAIL_APP_PASSWORD ?? "";
  const body: Record<string, unknown> = {
    configured: Boolean(user && pass),
    gmailUser: user,
    appPassword: pass
      ? { length: pass.length, spaces: /\s/.test(pass), startsWith: pass[0], endsWith: pass[pass.length - 1] }
      : null,
    from: process.env.EMAIL_FROM ?? null,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
  };
  if (request.nextUrl.searchParams.get("test") === "1" && user) {
    body.test = await send({
      to: user,
      subject: "Siftag pop-up: test email",
      text: `Sent from ${process.env.NEXT_PUBLIC_SITE_URL ?? "the pop-up app"} by ${session.name} to check the mail setup. Nothing to do.`,
    });
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
