/**
 * Payments run on Stripe. Two flows share this file: the express checkout
 * (a shopper pays on their phone and collects at the counter) and, later,
 * the till. Both open a Stripe Checkout Session for a fixed set of units
 * and rely on the one webhook in app/api/popup/express/webhook to turn a
 * paid session into sold units.
 *
 * Not to be confused with lib/shopify.ts, which scrapes vendors' own
 * Shopify stores for their catalogue and has nothing to do with payment.
 */

import Stripe from "stripe";

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is required to take payments");
  client = new Stripe(key);
  return client;
}

/**
 * Public origin for links that leave the site (Stripe return URLs, tag QRs).
 * An empty env value counts as unset, and a bare host gets https:// so a
 * phone camera treats the QR as a link and Stripe accepts the return URLs.
 */
export function siteOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002").trim().replace(/\/$/, "");
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/**
 * Stripe won't let a Checkout Session live for less than 30 minutes. The
 * hold on the units has to outlast the session, otherwise a shopper can
 * pay for garments that went back on the floor a minute earlier.
 */
export const MIN_CHECKOUT_MINUTES = 30;

export type CheckoutLineItem = {
  unitCode: string;
  productTitle: string;
  brandName: string;
  size: string | null;
  priceGbp: number;
};

export type OrderSource = "express" | "till";

/**
 * Opens a hosted Checkout Session: one line per garment, priced in pence,
 * receipt emailed by Stripe. Returns the id to store on the order and the
 * URL to send the payer to.
 */
export async function createCheckoutSession(params: {
  orderId: string;
  collectCode: string;
  source: OrderSource;
  lineItems: CheckoutLineItem[];
  email?: string;
  expiresInMinutes: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  const minutes = Math.max(params.expiresInMinutes, MIN_CHECKOUT_MINUTES);
  const metadata = {
    order_id: params.orderId,
    collect_code: params.collectCode,
    source: params.source,
  };

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    currency: "gbp",
    line_items: params.lineItems.map((li) => ({
      quantity: 1,
      price_data: {
        currency: "gbp",
        unit_amount: Math.round(li.priceGbp * 100),
        product_data: {
          name: li.productTitle,
          description: [li.brandName, li.size ? `Size ${li.size}` : null, `Tag ${li.unitCode}`]
            .filter(Boolean)
            .join(" · "),
        },
      },
    })),
    customer_email: params.email,
    client_reference_id: params.orderId,
    metadata,
    payment_intent_data: {
      // Stripe sends its own receipt to this address once the charge lands.
      receipt_email: params.email,
      description: `Siftag Pop-Up ${params.source} order ${params.collectCode}`,
      metadata,
    },
    expires_at: Math.floor(Date.now() / 1000) + minutes * 60,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  if (!session.url) throw new Error("Stripe returned a Checkout Session without a URL");
  return { id: session.id, url: session.url };
}

/** The payment page for a session that hasn't been paid or expired yet, or null. */
export async function openCheckoutUrl(sessionId: string): Promise<string | null> {
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    return session.status === "open" ? session.url : null;
  } catch (err) {
    console.error("Stripe session lookup failed", err, sessionId);
    return null;
  }
}

/** Ends an open session so the payer can't complete it after we've released their items. Best effort. */
export async function expireCheckoutSession(sessionId: string): Promise<void> {
  try {
    await stripe().checkout.sessions.expire(sessionId);
  } catch (err) {
    // Already completed or expired: nothing to do.
    console.warn("Stripe session expire skipped", (err as Error).message, sessionId);
  }
}

/** Verifies the Stripe-Signature header against the raw body. Throws on a bad signature. */
export function constructWebhookEvent(rawBody: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return stripe().webhooks.constructEvent(rawBody, signature, secret);
}

export function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  if (!pi) return null;
  return typeof pi === "string" ? pi : pi.id;
}
