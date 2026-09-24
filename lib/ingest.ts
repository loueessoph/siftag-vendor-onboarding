/**
 * Writes a scraped catalogue into popup_products and popup_variants.
 *
 * The whole design constraint here is that a re-scrape must be safe to run at
 * any time. A brand may have spent an evening typing fibre compositions and
 * counting stock; pulling fresh prices must not touch a word of it. So the
 * scrape owns exactly the columns it produced, and nothing else:
 *
 *   scrape owns   title, handle, image_url, image_urls, product_type, exclusion,
 *                 vendor_sku, barcode, size, colour, online_price
 *   vendor owns   fibre_composition, natural_fibre_pct, care_notes,
 *                 sizing_notes, selected, popup_price, quantity_declared
 *
 * Fibre composition is the one column with a foot in both camps: the scrape
 * seeds it from the product description so the vendor starts from a filled
 * form, but only while the column is empty. Once anything is there, typed or
 * seeded, a re-scrape leaves it alone.
 *   we own        sku (assigned once, never reissued), approval_status,
 *                 quantity_received
 *
 * That's why this isn't a single upsert: existing rows get an update payload
 * containing only the scrape's columns, so the rest is untouched by omission.
 */

import { generateSku, type ScrapedProduct } from "./shopify";
import { fetchCatalogue } from "./catalogue";
import { joinNotes, readComposition, splitNotes } from "./fibre";
import { supabaseAdmin } from "./supabase/server";

export type IngestResult = {
  productsAdded: number;
  productsUpdated: number;
  variantsAdded: number;
  variantsUpdated: number;
  excluded: number;
  skusAssigned: number;
  /** Products whose fibre composition was read from their description. */
  compositionsSeeded: number;
};

export class SubmittedListError extends Error {
  constructor() {
    super(
      "This brand has submitted their list. Re-scraping is blocked so the submitted selection can't drift."
    );
  }
}

export async function ingestCatalogue(
  brandId: string,
  brandCode: string,
  /** A store domain to scrape (Shopify or WooCommerce), or an already-parsed catalogue from a CSV. */
  source: string | ScrapedProduct[]
): Promise<IngestResult> {
  const db = supabaseAdmin();

  const { data: brand, error: brandError } = await db
    .from("popup_brands")
    .select("id, submission_status")
    .eq("id", brandId)
    .single();
  if (brandError) throw brandError;

  // Once a list is submitted it is frozen in popup_submissions, but leaving
  // the live catalogue mutable would still let a re-scrape change what the
  // vendor sees against what they sent. Refuse rather than surprise them.
  if (brand.submission_status === "submitted") throw new SubmittedListError();

  const scraped =
    typeof source === "string" ? await fetchCatalogue(source) : source;
  const result: IngestResult = {
    productsAdded: 0,
    productsUpdated: 0,
    variantsAdded: 0,
    variantsUpdated: 0,
    excluded: scraped.filter((p) => p.exclusionReason).length,
    skusAssigned: 0,
    compositionsSeeded: 0,
  };

  const { data: existingProducts, error: readError } = await db
    .from("popup_products")
    .select("id, shopify_product_id, fibre_composition, care_notes")
    .eq("popup_brand_id", brandId);
  if (readError) throw readError;

  const productIdByShopifyId = new Map(
    (existingProducts ?? []).map((p) => [p.shopify_product_id, p.id])
  );
  const hasComposition = new Set(
    (existingProducts ?? [])
      .filter((p) => p.fibre_composition?.trim())
      .map((p) => p.id)
  );
  const existingNotes = new Map(
    (existingProducts ?? []).map((p) => [p.id, p.care_notes as string | null])
  );

  const scrapedAt = new Date().toISOString();
  let nextSkuNumber = await highestSkuNumber(brandId, brandCode);

  for (const product of scraped) {
    const existingId = productIdByShopifyId.get(product.shopifyProductId);

    // Columns the scrape owns. Absent from the update payload: everything the
    // vendor or we filled in.
    const productFields = {
      title: product.title,
      handle: product.handle,
      image_url: product.imageUrl,
      image_urls: product.imageUrls,
      product_type: product.productType,
      is_excluded: product.exclusionReason !== null,
      exclusion_reason: product.exclusionReason,
      scraped_at: scrapedAt,
    };

    // Seeded only into an empty column: see the ownership note at the top.
    const seed: Record<string, unknown> =
      product.fibreComposition && !(existingId && hasComposition.has(existingId))
        ? {
            fibre_composition: product.fibreComposition,
            natural_fibre_pct: readComposition(product.fibreComposition).naturalPct,
          }
        : {};
    // An itemised statement (body, trim, lining) goes into the item's notes
    // so the whole of it reaches us, not just the body the composition holds.
    {
      const current = existingId ? existingNotes.get(existingId) ?? null : null;
      const { fabric, own } = splitNotes(current);
      // Refresh our line (or drop it if the site no longer needs one), never theirs.
      if ((fabric ?? null) !== (product.fabricDetails ?? null)) {
        seed.care_notes = joinNotes(product.fabricDetails, own);
      }
    }

    let productId: string;
    if (existingId) {
      const { error } = await db
        .from("popup_products")
        .update({ ...productFields, ...seed })
        .eq("id", existingId);
      if (error) throw error;
      productId = existingId;
      result.productsUpdated++;
      if (seed.fibre_composition) result.compositionsSeeded++;
    } else {
      const { data, error } = await db
        .from("popup_products")
        .insert({
          popup_brand_id: brandId,
          shopify_product_id: product.shopifyProductId,
          ...productFields,
          ...seed,
        })
        .select("id")
        .single();
      if (error) throw error;
      productId = data.id;
      result.productsAdded++;
      if (seed.fibre_composition) result.compositionsSeeded++;
    }

    const { data: existingVariants, error: variantReadError } = await db
      .from("popup_variants")
      .select("id, shopify_variant_id")
      .eq("popup_product_id", productId);
    if (variantReadError) throw variantReadError;

    const variantIdByShopifyId = new Map(
      (existingVariants ?? []).map((v) => [v.shopify_variant_id, v.id])
    );

    for (const variant of product.variants) {
      const variantFields = {
        vendor_sku: variant.vendorSku,
        barcode: variant.barcode,
        size: variant.size,
        colour: variant.colour,
        online_price: variant.onlinePrice,
      };

      const existingVariantId = variantIdByShopifyId.get(
        variant.shopifyVariantId
      );

      if (existingVariantId) {
        // No sku, popup_price, selected or quantity here — a price change on
        // the brand's website must not silently reprice the pop-up or undo a
        // selection.
        const { error } = await db
          .from("popup_variants")
          .update(variantFields)
          .eq("id", existingVariantId);
        if (error) throw error;
        result.variantsUpdated++;
      } else {
        // Excluded products still get rows so the decision stays visible in
        // admin, but they don't consume till codes.
        const sku = product.exclusionReason
          ? null
          : generateSku(brandCode, ++nextSkuNumber);
        if (sku) result.skusAssigned++;

        const { error } = await db.from("popup_variants").insert({
          popup_product_id: productId,
          shopify_variant_id: variant.shopifyVariantId,
          sku,
          // Defaults to the online price, as the vendor pack promises. Only
          // ever set here, on first sight of the variant.
          popup_price: variant.onlinePrice,
          ...variantFields,
        });
        if (error) throw error;
        result.variantsAdded++;
      }
    }
  }

  return result;
}

/**
 * Till codes are never reissued, so numbering continues from the highest one
 * already assigned rather than from the row count — a deleted product must not
 * hand its code to something else.
 */
export async function highestSkuNumber(
  brandId: string,
  brandCode: string
): Promise<number> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("popup_products")
    .select("popup_variants(sku)")
    .eq("popup_brand_id", brandId);
  if (error) throw error;

  const prefix = `SFTG-${brandCode.toUpperCase()}-`;
  let highest = 0;
  for (const product of data ?? []) {
    for (const variant of (product.popup_variants ?? []) as { sku: string | null }[]) {
      if (!variant.sku?.startsWith(prefix)) continue;
      const n = Number.parseInt(variant.sku.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > highest) highest = n;
    }
  }
  return highest;
}
