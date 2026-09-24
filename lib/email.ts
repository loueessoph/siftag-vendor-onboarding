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
  /**
   * Optional HTML twin, for the one message shoppers read on a phone:
   * plain text can't keep an item list and its prices lined up there.
   */
  html?: string;
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
      html: message.html,
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


function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type PaidOrder = {
  email: string;
  name: string | null;
  collectCode: string;
  totalGbp: number;
  source: "express" | "till";
  items: Array<{ productTitle: string; brandName: string; size: string | null; priceGbp: number }>;
};

const VENUE_LINE = "Siftag Pop-Up at Fabrica X, 36–40 York Way, King's Cross";
const HOURS_LINE = "Friday 25 to Sunday 27 September, 9am to 6pm";

/**
 * Both bodies of the paid-order email. Exported so the HTML can be looked
 * at in a browser without sending anything.
 */
export function renderOrderPaid(order: PaidOrder): { subject: string; text: string; html: string } {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002").replace(/\/$/, "");
  const confirmUrl = `${origin}/popup/express/confirm/${order.collectCode}`;
  const first = order.name?.trim().split(" ")[0];
  const greeting = `Hi${first ? ` ${first}` : ""},`;
  const total = `£${order.totalGbp.toFixed(2)}`;
  const isExpress = order.source === "express";

  // One item per line, price last, so a narrow screen wraps it sensibly.
  const textLines = order.items
    .map((i) => `- ${i.productTitle}, ${i.brandName}${i.size ? `, size ${i.size}` : ""}: £${i.priceGbp.toFixed(2)}`)
    .join("\n");

  const textCollect = isExpress
    ? `Show this code at the Express counter to collect your items:

${order.collectCode}

Or open this page and show the QR code:
${confirmUrl}`
    : `Your collection code, in case you need to refer to this purchase:

${order.collectCode}`;

  const text = `${greeting}

Thank you, your payment of ${total} has gone through.

${textLines}

${textCollect}

We'll email you again as soon as it's packed and ready to collect.

${VENUE_LINE}
${HOURS_LINE}

Payment was taken securely by Stripe; we never see or store your card details.
Questions? Reply to this email.`;

  // Table-based and inline-styled: the only layout that survives every
  // mail client. One column, capped at 480px, so it reads the same on a
  // phone and a laptop.
  const rows = order.items
    .map(
      (i) => `
          <tr>
            <td style="padding:10px 0;border-top:1px solid #e5e5e5;font-size:15px;line-height:1.4;color:#171717;">
              ${escapeHtml(i.productTitle)}
              <div style="font-size:13px;color:#737373;">${escapeHtml(i.brandName)}${i.size ? ` · Size ${escapeHtml(i.size)}` : ""}</div>
            </td>
            <td align="right" valign="top" style="padding:10px 0 10px 16px;border-top:1px solid #e5e5e5;font-size:15px;line-height:1.4;color:#171717;white-space:nowrap;">£${i.priceGbp.toFixed(2)}</td>
          </tr>`
    )
    .join("");

  const collectBlock = isExpress
    ? `
        <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#171717;">Show this code at the Express counter to collect your items:</p>
        <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:36px;letter-spacing:0.12em;color:#171717;">${escapeHtml(order.collectCode)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;">
          <tr>
            <td style="background:#171717;">
              <a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:14px 22px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#ffffff;text-decoration:none;">Open your QR code</a>
            </td>
          </tr>
        </table>
        <p style="margin:0;font-size:13px;line-height:1.5;color:#737373;">Either the code or the QR on that page will do. We'll email you again as soon as it's packed and ready to collect.</p>`
    : `
        <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#171717;">Your collection code, in case you need to refer to this purchase:</p>
        <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:36px;letter-spacing:0.12em;color:#171717;">${escapeHtml(order.collectCode)}</p>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Your Siftag Pop-Up order ${escapeHtml(order.collectCode)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:32px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#171717;">
          <tr>
            <td style="padding:0 0 28px;">
              <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#737373;">Siftag Pop-Up</p>
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:28px;line-height:1.2;color:#171717;">Thank you, your payment has gone through.</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 24px;font-size:15px;line-height:1.5;color:#171717;">${escapeHtml(greeting)}</td>
          </tr>
          <tr>
            <td style="padding:0 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}
                <tr>
                  <td style="padding:14px 0 0;border-top:1px solid #171717;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#737373;">Total paid</td>
                  <td align="right" style="padding:14px 0 0 16px;border-top:1px solid #171717;font-size:17px;color:#171717;white-space:nowrap;">${total}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 32px;">${collectBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 0 0;border-top:1px solid #e5e5e5;font-size:13px;line-height:1.6;color:#737373;">
              ${escapeHtml(VENUE_LINE)}<br>
              ${escapeHtml(HOURS_LINE)}<br><br>
              Payment was taken securely by Stripe; we never see or store your card details.<br>
              Questions? Reply to this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: `Your Siftag Pop-Up order ${order.collectCode}`, text, html };
}

/**
 * Sent the moment a card payment lands: what they bought and the code to
 * show at the collection counter. The one message here with an HTML body,
 * because shoppers open it on a phone and plain text can't hold a priced
 * list together at that width. Delivery failures are reported, never
 * thrown: the order is paid whether or not the email goes.
 */
export async function notifyOrderPaid(order: PaidOrder): Promise<SendResult> {
  const { subject, text, html } = renderOrderPaid(order);
  return send({ to: order.email, subject, text, html, replyTo: ADMIN });
}

type ReadyOrder = {
  email: string;
  name: string | null;
  collectCode: string;
  items: Array<{ productTitle: string; brandName: string; size: string | null }>;
};

/** Both bodies of the "packed and ready" email. */
export function renderOrderReady(order: ReadyOrder): { subject: string; text: string; html: string } {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002").replace(/\/$/, "");
  const confirmUrl = `${origin}/popup/express/confirm/${order.collectCode}`;
  const first = order.name?.trim().split(" ")[0];
  const greeting = `Hi${first ? ` ${first}` : ""},`;
  const textLines = order.items
    .map((i) => `- ${i.productTitle}, ${i.brandName}${i.size ? `, size ${i.size}` : ""}`)
    .join("\n");

  const text = `${greeting}

Your order is packed and ready to collect at the Express counter.

${textLines}

Show this code, or the QR on this page, when you arrive:

${order.collectCode}
${confirmUrl}

${VENUE_LINE}
${HOURS_LINE}

Questions? Reply to this email.`;

  const rows = order.items
    .map(
      (i) => `
          <tr>
            <td style="padding:10px 0;border-top:1px solid #e5e5e5;font-size:15px;line-height:1.4;color:#171717;">
              ${escapeHtml(i.productTitle)}
              <div style="font-size:13px;color:#737373;">${escapeHtml(i.brandName)}${i.size ? ` · Size ${escapeHtml(i.size)}` : ""}</div>
            </td>
          </tr>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Your Siftag Pop-Up order ${escapeHtml(order.collectCode)} is ready</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:32px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#171717;">
          <tr>
            <td style="padding:0 0 28px;">
              <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#737373;">Siftag Pop-Up</p>
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:28px;line-height:1.2;color:#171717;">Your order is ready to collect.</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 24px;font-size:15px;line-height:1.5;color:#171717;">${escapeHtml(greeting)}<br><br>It's packed and waiting for you at the Express counter.</td>
          </tr>
          <tr>
            <td style="padding:0 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 32px;">
              <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#171717;">Show this code, or the QR on your order page, when you arrive:</p>
              <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:36px;letter-spacing:0.12em;color:#171717;">${escapeHtml(order.collectCode)}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#171717;">
                    <a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:14px 22px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#ffffff;text-decoration:none;">Open your QR code</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 0 0;border-top:1px solid #e5e5e5;font-size:13px;line-height:1.6;color:#737373;">
              ${escapeHtml(VENUE_LINE)}<br>
              ${escapeHtml(HOURS_LINE)}<br><br>
              Questions? Reply to this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: `Your Siftag Pop-Up order ${order.collectCode} is ready to collect`, text, html };
}

/**
 * Sent when the counter marks an online order packed. Best effort, like the
 * confirmation: the order is ready whether or not the email goes.
 */
export async function notifyOrderReady(order: ReadyOrder): Promise<SendResult> {
  const { subject, text, html } = renderOrderReady(order);
  return send({ to: order.email, subject, text, html, replyTo: ADMIN });
}
