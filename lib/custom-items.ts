/**
 * Items a brand adds by hand: a sample, a one-off, something not on their
 * website. They live in the same tables as scraped products so everything
 * downstream (selection, submission, approval, tags) treats them alike. The
 * id prefix is what marks them: `vendor:` never collides with a Shopify id
 * or a `csv:`/`woo:` one, and a re-scrape only ever touches ids it produced,
 * so these survive it.
 */

import { supabaseAdmin } from "./supabase/server";
import { generateSku } from "./shopify";
import { highestSkuNumber } from "./ingest";
import { readComposition } from "./fibre";

export const CUSTOM_PREFIX = "vendor:";

export function isCustomProduct(shopifyProductId: string | null): boolean {
  return shopifyProductId?.startsWith(CUSTOM_PREFIX) ?? false;
}

export type NewCustomItem = {
  title: string;
  colour: string | null;
  imageUrl: string | null;
  /** "XS, S, M" or empty for one size. */
  sizes: string[];
  popupPrice: number | null;
  fibreComposition: string | null;
};

export async function addCustomItem(
  brandId: string,
  brandCode: string,
  input: NewCustomItem
): Promise<string> {
  const db = supabaseAdmin();
  const id = crypto.randomUUID();
  const composition = input.fibreComposition?.trim() || null;

  const { data: product, error } = await db
    .from("popup_products")
    .insert({
      popup_brand_id: brandId,
      shopify_product_id: `${CUSTOM_PREFIX}${id}`,
      title: input.title.trim(),
      handle: id,
      image_url: input.imageUrl,
      product_type: null,
      is_excluded: false,
      exclusion_reason: null,
      fibre_composition: composition,
      natural_fibre_pct: composition ? readComposition(composition).naturalPct : null,
      scraped_at: null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const sizes = input.sizes.length > 0 ? input.sizes : [null];
  let n = await highestSkuNumber(brandId, brandCode);
  const rows = sizes.map((size, i) => ({
    popup_product_id: product.id,
    shopify_variant_id: `${CUSTOM_PREFIX}${id}:${i}`,
    sku: generateSku(brandCode, ++n),
    vendor_sku: null,
    barcode: null,
    size,
    colour: input.colour,
    online_price: input.popupPrice,
    popup_price: input.popupPrice,
    // Added by hand means they're bringing it: ticked from the start.
    selected: true,
    quantity_declared: null,
  }));
  const { error: variantError } = await db.from("popup_variants").insert(rows);
  if (variantError) {
    await db.from("popup_products").delete().eq("id", product.id);
    throw variantError;
  }
  return product.id;
}

/** Only ever a custom item, and only the brand's own. Scraped rows stay. */
export async function removeCustomItem(
  brandId: string,
  productId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("popup_products")
    .delete()
    .eq("id", productId)
    .eq("popup_brand_id", brandId)
    .like("shopify_product_id", `${CUSTOM_PREFIX}%`)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * A size the website doesn't list, on any product. Ticked, priced like its
 * siblings, with its own till code. Returns null if the size already exists.
 */
export async function addSize(
  brandId: string,
  brandCode: string,
  productId: string,
  size: string,
  colour: string | null = null
): Promise<{
  id: string;
  sku: string | null;
  vendorSku: string | null;
  size: string | null;
  colour: string | null;
  onlinePrice: number | null;
  popupPrice: number | null;
  selected: boolean;
  quantityDeclared: number | null;
  custom: boolean;
} | null> {
  const db = supabaseAdmin();
  const { data: product, error } = await db
    .from("popup_products")
    .select("id, popup_variants(size, colour, online_price, popup_price)")
    .eq("id", productId)
    .eq("popup_brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  if (!product) throw new Error("Product not found for this brand.");

  const siblings = (product.popup_variants ?? []) as {
    size: string | null;
    colour: string | null;
    online_price: number | null;
    popup_price: number | null;
  }[];
  const same = (a: string | null, b: string | null) =>
    (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
  if (siblings.some((v) => same(v.size, size) && same(v.colour, colour ?? siblings[0]?.colour ?? null))) {
    return null;
  }
  // Price like a sibling of the same colour where there is one.
  const like = siblings.find((v) => same(v.colour, colour)) ?? siblings[0];
  const sku = generateSku(brandCode, (await highestSkuNumber(brandId, brandCode)) + 1);

  const { data, error: insertError } = await db
    .from("popup_variants")
    .insert({
      popup_product_id: productId,
      shopify_variant_id: `${CUSTOM_PREFIX}${productId}:${crypto.randomUUID()}`,
      sku,
      vendor_sku: null,
      barcode: null,
      size,
      colour: colour ?? like?.colour ?? null,
      online_price: like?.online_price ?? null,
      popup_price: like?.popup_price ?? like?.online_price ?? null,
      selected: true,
      quantity_declared: null,
    })
    .select("id, sku, vendor_sku, size, colour, online_price, popup_price, selected, quantity_declared")
    .single();
  if (insertError) throw insertError;
  return {
    id: data.id,
    sku: data.sku,
    vendorSku: data.vendor_sku,
    size: data.size,
    colour: data.colour,
    onlinePrice: data.online_price == null ? null : Number(data.online_price),
    popupPrice: data.popup_price == null ? null : Number(data.popup_price),
    selected: Boolean(data.selected),
    quantityDeclared: data.quantity_declared,
    custom: true,
  };
}

/**
 * Removes a size from the brand's list, theirs or scraped. A scraped size
 * comes back on the next admin re-scrape, unticked and with a fresh till
 * code, which is harmless to the brand's list; that is the price of letting
 * them tidy a run they'll never bring.
 */
export async function removeSize(brandId: string, variantId: string): Promise<boolean> {
  const db = supabaseAdmin();
  const { data: owned, error } = await db
    .from("popup_variants")
    .select("id, popup_products!inner(popup_brand_id)")
    .eq("id", variantId)
    .eq("popup_products.popup_brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  if (!owned) return false;
  const { error: delError } = await db.from("popup_variants").delete().eq("id", variantId);
  if (delError) throw delError;
  return true;
}
