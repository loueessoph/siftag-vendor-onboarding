/**
 * Outbound email, sent as a Google account over SMTP (Gmail or Google
 * Workspace) with an app password. No DNS to verify: Google authenticates
 * its own domain.
 *
 * Deliberately behind one interface, so swapping providers later is one
 * file. With GMAIL_USER and GMAIL_APP_PASSWORD unset, sending is a no-op
 * that logs what it *would* have sent and reports back that it didn't.
 * That matters: an unsent "contract signed" notice must never look like a
 * sent one, so callers get a `delivered` flag rather than silence.
 */

import nodemailer from "nodemailer";
import type { BrandRow } from "./brands";
import type { SelectionSummary } from "./selection";
import { KEY_DATES, formatDate, stockArrivalFor } from "./dates";
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

/** Gmail's limit is 2,000 messages a day on Workspace and 500 on a personal account, plenty here. */
export async function send(message: Message): Promise<SendResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.warn(
      `[email] NOT SENT (no GMAIL_USER/GMAIL_APP_PASSWORD) to=${message.to} subject="${message.subject}"\n${message.text}`
    );
    return { delivered: false, reason: "No email provider configured" };
  }

  // Logs in as GMAIL_USER but sends as EMAIL_FROM, which works when that
  // address is set up as a "Send mail as" alias in the account's Gmail
  // settings; otherwise Google quietly rewrites the From to the account.
  const displayName = FROM.match(/^(.*?)\s*</)?.[1]?.trim() || "Siftag Pop-Up";
  const from = /<[^>]+@[^>]+>/.test(FROM) ? FROM : `${displayName} <${user}>`;
  try {
    const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      replyTo: message.replyTo,
    });
    return { delivered: true };
  } catch (error) {
    console.error("[email] send failed", error);
    return { delivered: false, reason: error instanceof Error ? error.message : "Send failed" };
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
  Terms       ${Number(brand.fee_gbp) > 0 ? `£${brand.fee_gbp} fee` : "No participation fee"}, ${brand.commission_pct}% commission

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

Next: get your stock to us by ${formatDate(stockArrivalFor(brand.is_international))}. Details are on your page:
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

/* Shoppers ----------------------------------------------------------------- */


/**
 * Sent the moment a card payment lands: what they bought and the code to
 * show at the collection counter. Plain text like everything else here.
 * Delivery failures are reported, never thrown: the order is paid whether
 * or not the email goes.
 */
export async function notifyOrderPaid(order: {
  email: string;
  name: string | null;
  collectCode: string;
  totalGbp: number;
  source: "express" | "till";
  items: Array<{ productTitle: string; brandName: string; size: string | null; priceGbp: number }>;
}): Promise<SendResult> {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002").replace(/\/$/, "");
  const lines = order.items
    .map((i) => `  ${i.productTitle} — ${i.brandName}${i.size ? ` (${i.size})` : ""}  £${i.priceGbp.toFixed(2)}`)
    .join("\n");
  const first = order.name?.trim().split(" ")[0];
  const collect =
    order.source === "express"
      ? `Show this code, or the QR on the page below, at the Express counter to collect your items:

  ${order.collectCode}

${origin}/popup/express/confirm/${order.collectCode}`
      : `Your collection code, in case you need to refer to this purchase:

  ${order.collectCode}`;

  return send({
    to: order.email,
    subject: `Your Siftag Pop-Up order ${order.collectCode}`,
    text: `Hi${first ? ` ${first}` : ""},

Thank you, your payment of £${order.totalGbp.toFixed(2)} has gone through.

${lines}

${collect}

Siftag Pop-Up at Fabrica X, 36–40 York Way, King's Cross
Friday 25 to Sunday 27 September, 9am to 6pm

Payment was taken securely by Stripe; we never see or store your card details.
Questions? Reply to this email.`,
    replyTo: ADMIN,
  });
}
