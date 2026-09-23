/**
 * Express-checkout payments via Shopify draft orders — custom line items,
 * so no product/variant sync with Shopify is required (each pop-up unit is
 * priced as a one-off line item). Ported from lib/shopify/client.ts on the
 * Siftag-Popup branch of the main siftag repo.
 */

import { createHmac, timingSafeEqual } from "crypto";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";

function config() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN; // e.g. "siftag-popup.myshopify.com"
  const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  if (!domain || !token) {
    throw new Error(
      "SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API_ACCESS_TOKEN are required to take express payments"
    );
  }
  return { domain, token };
}

export interface DraftOrderLineItem {
  title: string;
  price: string; // decimal string, e.g. "45.00"
  quantity: number;
  sku?: string;
}

/**
 * Creates a Shopify draft order and returns the hosted invoice URL the
 * buyer pays on. Shopify auto-converts the draft order into a real, paid
 * Order when the buyer completes checkout on that link, which fires the
 * `draft_orders/update` webhook the handler below listens for.
 */
export async function createDraftOrder(params: {
  lineItems: DraftOrderLineItem[];
  email?: string;
  phone?: string;
  note?: string;
}) {
  const { domain, token } = config();
  const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/draft_orders.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      draft_order: {
        line_items: params.lineItems.map((li) => ({
          title: li.title,
          price: li.price,
          quantity: li.quantity,
          sku: li.sku,
          requires_shipping: false,
          taxable: true,
        })),
        email: params.email,
        phone: params.phone,
        note: params.note,
        use_customer_default_address: false,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Shopify draft order creation failed", res.status, body);
    throw new Error(`Shopify draft order creation failed (${res.status})`);
  }

  const json = await res.json();
  return {
    id: String(json.draft_order.id),
    invoiceUrl: json.draft_order.invoice_url as string,
    status: json.draft_order.status as string,
  };
}

export async function getDraftOrder(draftOrderId: string) {
  const { domain, token } = config();
  const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/draft_orders/${draftOrderId}.json`, {
    headers: { "X-Shopify-Access-Token": token },
  });
  if (!res.ok) throw new Error(`Shopify draft order lookup failed (${res.status})`);
  const json = await res.json();
  return json.draft_order as { id: number; status: string; order_id: number | null };
}

/**
 * Verifies the `X-Shopify-Hmac-Sha256` header against the raw request body.
 * Must run on the raw (unparsed) body — Shopify signs the exact bytes sent.
 */
export function verifyShopifyWebhook(rawBody: string, hmacHeader: string | null): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret || !hmacHeader) return false;
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
