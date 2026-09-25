import { NextRequest, NextResponse } from "next/server";
import { tillSession } from "../../till/_auth";

/**
 * Is this deployment able to send email? Says which pieces are set, never
 * their values. Confirmation and ready-for-pickup emails go nowhere when
 * the Gmail variables are missing, and the only other sign is a log line.
 */
export async function GET(request: NextRequest) {
  const session = await tillSession(request);
  if (session instanceof NextResponse) return session;
  const user = Boolean(process.env.GMAIL_USER);
  const password = Boolean(process.env.GMAIL_APP_PASSWORD);
  return NextResponse.json(
    {
      configured: user && password,
      gmailUser: user,
      gmailAppPassword: password,
      from: process.env.EMAIL_FROM ?? null,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
