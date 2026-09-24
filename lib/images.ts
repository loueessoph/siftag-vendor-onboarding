/**
 * Product photos are hot-linked from the brands' own hosts, mostly Shopify's
 * CDN, at their original size (a card image can be over a megabyte). Two
 * things bring that down: Shopify resizes on request when asked with a
 * `width` parameter, and next/image resizes, converts to WebP and caches
 * whatever it is given. This helper does the first; <Image> does the rest.
 */

const SHOPIFY = /(^https?:\/\/cdn\.shopify\.com\/)|(\/cdn\/shop\/)/;

/** The same image, no wider than `width`, where the host can do that for us. */
export function sized(url: string, width: number): string {
  if (!SHOPIFY.test(url)) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("width", String(width));
    return u.toString();
  } catch {
    return url;
  }
}
