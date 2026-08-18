/**
 * Catalogue CSV import, for the brands that aren't on Shopify. There will be
 * at least one.
 *
 * Accepts the columns a brand can actually produce from a spreadsheet:
 * title, sku, size, colour, price, image_url. Rows sharing a title are folded
 * into one product with several variants, which is how a size run arrives.
 */

import type { ScrapedProduct, ScrapedVariant } from "./shopify";

/** Minimal RFC 4180 reader: handles quoted fields and embedded commas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

const ALIASES: Record<string, string[]> = {
  title: ["title", "product", "product title", "name", "product name"],
  sku: ["sku", "code", "product code", "variant sku"],
  size: ["size", "variant", "option1"],
  colour: ["colour", "color", "option2"],
  price: ["price", "rrp", "retail price", "online price"],
  image_url: ["image_url", "image", "image url", "photo", "img"],
};

function mapHeaders(header: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  header.forEach((raw, i) => {
    const cell = raw.trim().toLowerCase();
    for (const [key, names] of Object.entries(ALIASES)) {
      if (names.includes(cell) && index[key] === undefined) index[key] = i;
    }
  });
  return index;
}

export class CsvFormatError extends Error {}

export function productsFromCsv(text: string): ScrapedProduct[] {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new CsvFormatError("That file has no rows in it.");
  }

  const index = mapHeaders(rows[0]);
  if (index.title === undefined) {
    throw new CsvFormatError(
      "Couldn't find a title column. Expected: title, sku, size, colour, price, image_url."
    );
  }

  const get = (row: string[], key: string): string | null => {
    const i = index[key];
    if (i === undefined) return null;
    return row[i]?.trim() || null;
  };

  const byTitle = new Map<string, ScrapedProduct>();

  rows.slice(1).forEach((row, n) => {
    const title = get(row, "title");
    if (!title) return;

    let product = byTitle.get(title);
    if (!product) {
      product = {
        // Stable per import so a re-upload updates rather than duplicates.
        shopifyProductId: `csv:${slug(title)}`,
        title,
        handle: slug(title),
        imageUrl: get(row, "image_url"),
        productType: null,
        exclusionReason: null,
        variants: [],
      };
      byTitle.set(title, product);
    }

    const price = get(row, "price");
    const variant: ScrapedVariant = {
      shopifyVariantId: `csv:${slug(title)}:${get(row, "sku") ?? n}`,
      vendorSku: get(row, "sku"),
      barcode: null,
      size: get(row, "size"),
      colour: get(row, "colour"),
      onlinePrice: price ? Number(price.replace(/[£$,\s]/g, "")) || null : null,
    };
    product.variants.push(variant);
    if (!product.imageUrl) product.imageUrl = get(row, "image_url");
  });

  const products = [...byTitle.values()];
  if (products.length === 0) {
    throw new CsvFormatError("No products found in that file.");
  }
  return products;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
