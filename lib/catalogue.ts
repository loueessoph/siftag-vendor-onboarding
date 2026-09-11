/**
 * Picks the right scraper for a store domain. Shopify is tried first because
 * its check is one cheap request and most brands are on it; WooCommerce is
 * the fallback for the rest. Anything else has to come in as a CSV.
 */

import {
  fetchShopifyCatalogue,
  normaliseDomain,
  type ScrapedProduct,
} from "./shopify";
import { fetchWooCommerceCatalogue, looksLikeWooCommerce } from "./woocommerce";

export type StorePlatform = "shopify" | "woocommerce";

export async function detectPlatform(domain: string): Promise<StorePlatform> {
  const host = normaliseDomain(domain);

  // A Shopify store answers products.json with JSON. Anything else either
  // 404s or serves an HTML "not found" page, which the content type gives away.
  const res = await fetch(`https://${host}/products.json?limit=1&country=GB`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (res.ok && /json/i.test(res.headers.get("content-type") ?? "")) {
    return "shopify";
  }

  if (await looksLikeWooCommerce(host)) return "woocommerce";

  throw new Error(
    `${host} doesn't look like a Shopify or WooCommerce store. Upload a CSV instead.`
  );
}

export async function fetchCatalogue(domain: string): Promise<ScrapedProduct[]> {
  const platform = await detectPlatform(domain);
  return platform === "shopify"
    ? fetchShopifyCatalogue(domain)
    : fetchWooCommerceCatalogue(domain);
}

const GENERIC_MAIL = /\b(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|mac|proton(?:mail)?|aol|mail|yandex)\.com$|\.co\.uk$/i;

/**
 * Where a product lives on the brand's own site, for a link from its card.
 * Shopify and WooCommerce have fixed URL shapes. A headless Shopify store
 * (Zubek) is scraped through its myshopify domain, which is not where
 * customers go, so the brand's public site is taken from their email domain
 * when that isn't a webmail provider. Items the brand added by hand, and
 * CSV rows, have no page to link to.
 */
export function productUrl(
  brand: { shopify_domain: string | null; contact_email: string },
  product: { shopify_product_id: string | null; handle: string | null }
): string | null {
  if (!brand.shopify_domain || !product.handle) return null;
  const id = product.shopify_product_id ?? "";
  if (id.startsWith("vendor:") || id.startsWith("csv:")) return null;

  let host = normaliseDomain(brand.shopify_domain);
  if (id.startsWith("woo:")) return `https://${host}/product/${product.handle}/`;

  if (/\.myshopify\.com$/i.test(host)) {
    const mailHost = brand.contact_email.split("@")[1]?.toLowerCase();
    if (mailHost && !GENERIC_MAIL.test(mailHost)) host = mailHost;
  }
  return `https://${host}/products/${product.handle}`;
}
