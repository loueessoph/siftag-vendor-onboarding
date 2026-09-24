/**
 * WooCommerce catalogue ingest, for the brands that aren't on Shopify.
 *
 * WooCommerce has no public product feed: its Store API is usually locked to
 * logged-in users, and the REST API needs keys the brand would have to
 * generate. What every WooCommerce shop does publish is HTML, and a variable
 * product's page carries the whole size and colour matrix as JSON in a
 * `data-product_variations` attribute, so we read that.
 *
 * Products are found through the category pages linked from /shop/, not the
 * sitemap: the sitemap can be years stale and still list trashed products,
 * whereas a category page only shows what is on sale.
 *
 * Output is the same shape as the Shopify scrape so `ingestCatalogue` doesn't
 * know or care which platform a brand is on.
 */

import type { ScrapedProduct, ScrapedVariant } from "./shopify";
import { normaliseDomain } from "./shopify";
import { extractComposition, fabricDetails } from "./fibre";

// Some WordPress hosts (Cloudflare, Wordfence) refuse the default fetch agent.
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 SiftagCatalogue/1.0",
  accept: "text/html",
};

/* HTML helpers --------------------------------------------------------------- */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", pound: "£",
  euro: "€", hellip: "…", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", trade: "™", copy: "©", reg: "®",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function first(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1] : null;
}

/** "dark-grey" → "Dark Grey". WooCommerce attribute values arrive as slugs. */
function unslug(value: string): string {
  return decodeEntities(value)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function money(text: string | null): number | null {
  if (!text) return null;
  const n = Number(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* Fetch ---------------------------------------------------------------------- */

async function getHtml(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) return null;
  return res.text();
}

/** Anything that is a WordPress site running WooCommerce. */
export async function looksLikeWooCommerce(domain: string): Promise<boolean> {
  const html = await getHtml(`https://${normaliseDomain(domain)}/`);
  return html !== null && /woocommerce/i.test(html);
}

/* Discovery ------------------------------------------------------------------ */

function productLinks(host: string, html: string): string[] {
  const re = new RegExp(
    `https?://(?:www\\.)?${host.replace(/\./g, "\\.")}/product/([a-z0-9][a-z0-9_-]*)/?`,
    "gi"
  );
  return [...html.matchAll(re)].map((m) => m[1].toLowerCase());
}

function categoryLinks(host: string, html: string): string[] {
  const re = new RegExp(
    `https?://(?:www\\.)?${host.replace(/\./g, "\\.")}/product-category/([a-z0-9][a-z0-9_/-]*?)/?["'#?]`,
    "gi"
  );
  return [...new Set([...html.matchAll(re)].map((m) => m[1].replace(/\/$/, "")))];
}

/**
 * Walks every category (and its pagination) and returns the set of product
 * handles. Falls back to the product sitemap only when the shop has no
 * categories to read at all.
 */
async function discoverHandles(host: string): Promise<string[]> {
  const handles = new Set<string>();
  const seenCategories = new Set<string>();

  const shop = (await getHtml(`https://${host}/shop/`)) ?? "";
  const home = (await getHtml(`https://${host}/`)) ?? "";
  const queue = categoryLinks(host, shop + home);

  while (queue.length > 0) {
    const category = queue.shift()!;
    if (seenCategories.has(category)) continue;
    seenCategories.add(category);

    for (let page = 1; page <= 30; page++) {
      const url =
        page === 1
          ? `https://${host}/product-category/${category}/`
          : `https://${host}/product-category/${category}/page/${page}/`;
      const html = await getHtml(url);
      if (!html) break;
      productLinks(host, html).forEach((h) => handles.add(h));
      // Subcategories are linked from their parent's page.
      categoryLinks(host, html).forEach((c) => {
        if (!seenCategories.has(c)) queue.push(c);
      });
      if (!/class="next page-numbers"/.test(html)) break;
    }
  }

  if (handles.size === 0) {
    const sitemap = (await getHtml(`https://${host}/product-sitemap.xml`)) ?? "";
    productLinks(host, sitemap).forEach((h) => handles.add(h));
  }

  return [...handles].sort();
}

/* Product pages -------------------------------------------------------------- */

type RawVariation = {
  variation_id: number;
  attributes: Record<string, string>;
  display_price: number | string;
  sku?: string;
  image?: { src?: string; url?: string };
  is_purchasable?: boolean;
  variation_is_active?: boolean;
  variation_is_visible?: boolean;
};

/**
 * Items that can't be sold across a physical till: gift cards and services
 * (alterations, mending, workshops). Nothing in WooCommerce marks these
 * reliably, so we go by what the brand called them.
 */
function exclusionReasonFor(title: string, productType: string | null): string | null {
  const text = `${title} ${productType ?? ""}`;
  if (/gift\s*(card|voucher)|voucher|e-?card/i.test(text)) {
    return "Not a physical product (gift card or similar)";
  }
  if (/\bservice\b|workshop|\bclass\b|repair|mending|alteration/i.test(text)) {
    return "A service, not a product";
  }
  return null;
}

function readVariations(html: string): RawVariation[] {
  const raw = first(html, /data-product_variations="([^"]*)"/);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(decodeEntities(raw));
    return Array.isArray(parsed) ? (parsed as RawVariation[]) : [];
  } catch {
    return [];
  }
}

function sizeAndColour(attributes: Record<string, string>) {
  let size: string | null = null;
  let colour: string | null = null;
  const extra: string[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (!value) continue;
    const name = key.replace(/^attribute_(pa_)?/, "").toLowerCase();
    if (/size/.test(name) && !size) size = unslug(value);
    else if (/colou?r/.test(name) && !colour) colour = unslug(value);
    else extra.push(unslug(value));
  }
  // Any other attribute (length, fit) joins the size so variants stay distinct.
  const label = [size, ...extra].filter(Boolean).join(" / ");
  return { size: label || null, colour };
}

/**
 * The price block is `<p class="price">…</p>`. On sale it holds the old price
 * in <del> and the current one in <ins>; a variable product shows a range and
 * we take the lower bound, which is only used where a variation has no price
 * of its own.
 */
function pagePriceFrom(html: string): number | null {
  const block = first(html, /<p class="price">([\s\S]*?)<\/p>/i);
  if (!block) return null;
  const current = first(block, /<ins[^>]*>([\s\S]*?)<\/ins>/i) ?? block;
  const digits = stripTags(current).match(/\d[\d,]*(?:\.\d+)?/);
  return money(digits?.[0] ?? null);
}

export function parseProductPage(
  handle: string,
  html: string
): ScrapedProduct | null {
  const title = stripTags(
    first(html, /<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ?? ""
  );
  if (!title) return null;

  const productId =
    first(html, /class="[^"]*\bpostid-(\d+)\b/) ??
    first(html, /data-product_id="(\d+)"/) ??
    handle;

  const productType = stripTags(
    first(
      html,
      /class="posted_in">[\s\S]*?<a[^>]*href="[^"]*\/product-category\/[^"]*"[^>]*>([^<]+)<\/a>/i
    ) ?? ""
  ) || null;

  const imageUrl =
    first(html, /property="og:image"\s+content="([^"]+)"/i) ??
    first(html, /class="[^"]*wp-post-image[^"]*"[^>]*\ssrc="([^"]+)"/i);

  // The page-level price and SKU. For a variable product the price shown here
  // is the cheapest variant, so it only stands in where a variation has none.
  const pagePrice = pagePriceFrom(html);
  const pageSku = stripTags(first(html, /<span class="sku">([^<]*)<\/span>/i) ?? "") || null;

  const exclusionReason = exclusionReasonFor(title, productType);

  // Composition lives in the description, the short description under the
  // price, or an "Additional information" attribute. Only those: the rest of
  // the page carries related products with compositions of their own.
  const descriptive = [
    first(html, /class="woocommerce-product-details__short-description"[^>]*>([\s\S]*?)<\/div>/i),
    first(html, /id="tab-description"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i),
    first(html, /<table class="woocommerce-product-attributes[^"]*"[\s\S]*?>([\s\S]*?)<\/table>/i),
  ]
    .filter(Boolean)
    .join(" ");
  const fibreComposition = extractComposition(decodeEntities(descriptive));
  const details = fabricDetails(decodeEntities(descriptive));

  const variations = readVariations(html).filter(
    (v) => v.variation_is_active !== false && v.variation_is_visible !== false
  );

  const variants: ScrapedVariant[] =
    variations.length > 0
      ? variations.map((v) => {
          const { size, colour } = sizeAndColour(v.attributes ?? {});
          return {
            shopifyVariantId: `woo:${v.variation_id}`,
            vendorSku: v.sku?.trim() || pageSku,
            barcode: null,
            size,
            colour,
            onlinePrice: money(String(v.display_price ?? "")) ?? pagePrice,
          };
        })
      : [
          {
            shopifyVariantId: `woo:${productId}`,
            vendorSku: pageSku,
            barcode: null,
            size: null,
            colour: null,
            onlinePrice: pagePrice,
          },
        ];

  return {
    shopifyProductId: `woo:${productId}`,
    title,
    handle,
    imageUrl: imageUrl ? decodeEntities(imageUrl) : null,
    imageUrls: imageUrl ? [decodeEntities(imageUrl)] : [],
    productType,
    exclusionReason,
    fibreComposition,
    fabricDetails: details,
    variants,
  };
}

/* Entry point ---------------------------------------------------------------- */

export async function fetchWooCommerceCatalogue(
  domain: string,
  { concurrency = 4 }: { concurrency?: number } = {}
): Promise<ScrapedProduct[]> {
  const host = normaliseDomain(domain);
  const handles = await discoverHandles(host);
  if (handles.length === 0) {
    throw new Error(`Found no products on ${host}. Is the shop public?`);
  }

  // A few pages at a time: fast enough for a catalogue of dozens, polite
  // enough not to trip a shared WordPress host's rate limiting.
  const out: ScrapedProduct[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < handles.length) {
        const handle = handles[next++];
        const html = await getHtml(`https://${host}/product/${handle}/`);
        if (!html) continue;
        const product = parseProductPage(handle, html);
        if (product) out.push(product);
      }
    })
  );

  return out.sort((a, b) => a.title.localeCompare(b.title));
}
