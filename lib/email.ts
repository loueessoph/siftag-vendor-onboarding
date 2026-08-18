/**
 * Outbound email.
 *
 * Deliberately behind one interface. Resend is what's wired up, but nothing
 * else in the codebase knows that, so swapping to Postmark or SendGrid later
 * is one file.
 *
 * With no RESEND_API_KEY set, sending is a no-op that logs what it *would*
 * have sent and reports back that it didn't. That matters: an unsent
 * "contract signed" notice must never look like a sent one, so callers get a
 * `delivered` flag rather than silence.
 */

import type { BrandRow } from "./brands";
import type { SelectionSummary } from "./selection";
import { KEY_DATES, formatDate } from "./dates";
import { plural } from "./format";

export type SendResult = { delivered: boolean; reason?: string };

type Message = {
  to: string;
  subject: string;
  /** Plain text. Deliverability is better and nobody needs a designed email. */
  text: string;
  replyTo?: string;
};

const FROM = process.env.EMAIL_FROM ?? "Siftag <brands@siftag.com>";
const ADMIN = process.env.ADMIN_EMAIL ?? "brands@siftag.com";

export async function send(message: Message): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    console.warn(
      `[email] NOT SENT (no RESEND_API_KEY) to=${message.to} subject="${message.subject}"\n${message.text}`
    );
    return { delivered: false, reason: "No email provider configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        reply_to: message.replyTo,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error(`[email] provider rejected: ${res.status} ${detail}`);
      return { delivered: false, reason: `Provider returned ${res.status}` };
    }
    return { delivered: true };
  } catch (error) {
    console.error("[email] send failed", error);
    return {
      delivered: false,
      reason: error instanceof Error ? error.message : "Send failed",
    };
  }
}

/* Messages ----------------------------------------------------------------- */

function vendorUrl(brand: BrandRow): string {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";
  return `${origin}/vendor/${brand.slug}/${brand.access_token}`;
}

/**
 * Sent the moment a brand signs. Two messages: their copy, and the one Sophie
 * asked for on brands@siftag.com.
 */
export async function notifyAgreementSigned(
  brand: BrandRow,
  signature: { name: string; title: string; email: string; version: string }
): Promise<{ vendor: SendResult; admin: SendResult }> {
  const signedAt = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/London",
  });

  const vendor = await send({
    to: signature.email,
    replyTo: ADMIN,
    subject: "Your signed agreement: Siftag at Fabrica X",
    text: `Hi ${signature.name.split(" ")[0]},

Thank you: your vendor agreement for the Siftag pop-up at Fabrica X is signed.

  Signed by   ${signature.name}, ${signature.title}
  For         ${brand.legal_name || brand.name}
  On          ${signedAt} (London)
  Version     ${signature.version}

You can read it again any time on your onboarding page:
${vendorUrl(brand)}

Next up is your product list, due ${formatDate(KEY_DATES.productList)}. Everything you need is on that page.

Sophie & the Siftag team
${ADMIN}`,
  });

  const admin = await send({
    to: ADMIN,
    replyTo: signature.email,
    subject: `Contract signed by ${brand.name}`,
    text: `${brand.name} has signed.

  Signed by   ${signature.name}, ${signature.title}
  Email       ${signature.email}
  For         ${brand.legal_name || brand.name}
  On          ${signedAt} (London)
  Version     ${signature.version}
  Terms       £${brand.fee_gbp} fee, ${brand.commission_pct}% commission

Their page: ${vendorUrl(brand)}`,
  });

  return { vendor, admin };
}

/** Sent when a brand submits their product list. */
export async function notifyListSubmitted(
  brand: BrandRow,
  summary: SelectionSummary
): Promise<{ vendor: SendResult; admin: SendResult }> {
  const vendor = await send({
    to: brand.contact_email,
    replyTo: ADMIN,
    subject: "Product list received: Siftag at Fabrica X",
    text: `Hi${brand.contact_name ? ` ${brand.contact_name.split(" ")[0]}` : ""},

We've got your product list: ${plural(
    summary.selectedProducts,
    "item"
  )}, ${plural(summary.totalUnits, "piece")} in total.

It's now fixed so we can print your tags and build the till from it. If something needs changing, reply to this email and we'll sort it.

Next: get your stock to us by ${formatDate(KEY_DATES.stockArrival)}. Details are on your page:
${vendorUrl(brand)}

Sophie & the Siftag team
${ADMIN}`,
  });

  const admin = await send({
    to: ADMIN,
    replyTo: brand.contact_email,
    subject: `Product list submitted by ${brand.name}`,
    text: `${brand.name} has submitted.

  Items       ${summary.selectedProducts}
  Pieces      ${summary.totalUnits}
  Variants    ${summary.selectedVariants}

Ready for approval: ${vendorUrl(brand)}`,
  });

  return { vendor, admin };
}
