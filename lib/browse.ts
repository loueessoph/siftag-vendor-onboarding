/**
 * The customer-facing catalogue: browse-everything grid, a neutral
 * product-detail page (no size pre-selected), and the per-garment tag page
 * a shopper lands on scanning a QR code. Ported from the Siftag-Popup
 * branch of the main siftag repo — this is now a full, standalone copy;
 * nothing here depends on that repo still existing.
 */

import { fromPopup } from "./supabase/server";
import { TEST_BRAND_NAME } from "./test-brand";
import { fetchAllRows } from "./supabase/fetch-all";
import { getActiveEvent, releaseExpiredHolds, type UnitStatus } from "./live-event";
import { classifyPopupItem, getStylePriority, type PopupCategory, type PopupGender } from "./categorize";
import { normalizeSizeLabel } from "./sizes";
import { compareSizes } from "./selection";
import { bodyFabric, splitNotes } from "./fibre";

export type SizeAvailability = {
  size: string | null;
  status: UnitStatus | "sold_out";
  count: number;
  buyUnitCode: string | null;
};

export type CatalogueItem = {
  productId: string;
  title: string;
  brandName: string;
  /** Names the logo at public/brand-logos/<slug>.png, where one exists. */
  brandSlug: string;
  /** First image is the default; a second (if the product has one) shows on hover. */
  imageUrls: string[];
  priceGbp: number | null;
  fibreComposition: string | null;
  naturalFibrePct: number | null;
  gender: PopupGender;
  category: PopupCategory;
  detailUnitCode: string | null;
  sizes: SizeAvailability[];
};

/**
 * Everything needed to browse the full pop-up catalogue at once: every
 * product (excluding the internal test brand), its live per-size status,
 * and a buyable unit code per available size.
 */
export async function getBrowseCatalogue(): Promise<CatalogueItem[]> {
  const event = await getActiveEvent();
  await releaseExpiredHolds(event.id);

  const { data: brands, error: brandsError } = await fromPopup("popup_brands")
    .select("id, name, slug")
    .neq("name", TEST_BRAND_NAME);
  if (brandsError) throw brandsError;
  const brandIds = (brands ?? []).map((b) => b.id);
  if (brandIds.length === 0) return [];
  const brandById = new Map((brands ?? []).map((b) => [b.id, b as { name: string; slug: string }]));

  const [products, allVariants, allEventUnits] = await Promise.all([
    fetchAllRows<{
      id: string;
      title: string;
      handle: string | null;
      image_url: string | null;
      image_urls: string[];
      fibre_composition: string | null;
      natural_fibre_pct: number | null;
      product_type: string | null;
      popup_brand_id: string;
      care_notes: string | null;
    }>(
      "popup_products",
      "id, title, handle, image_url, image_urls, fibre_composition, natural_fibre_pct, product_type, popup_brand_id, care_notes",
      (q) => q.in("popup_brand_id", brandIds).eq("is_excluded", false)
    ),
    // Fetches all variants/units rather than `.in("popup_product_id"/"popup_variant_id",
    // idArray)` — with hundreds+ of UUIDs in one query string, that trips undici's
    // header-size limit once the catalogue grows past ~150 products. Filtering by
    // the id Sets below does the real filtering.
    fetchAllRows<{
      id: string;
      size: string | null;
      popup_price: number | null;
      online_price: number | null;
      popup_product_id: string;
    }>("popup_variants", "id, size, popup_price, online_price, popup_product_id"),
    fetchAllRows<{
      unit_code: string;
      status: UnitStatus;
      popup_variant_id: string;
    }>("popup_units", "unit_code, status, popup_variant_id", (q) => q.eq("event_id", event.id)),
  ]);

  const productIds = products.map((p) => p.id);
  if (productIds.length === 0) return [];

  const productIdSet = new Set(productIds);
  const variants = allVariants.filter((v) => productIdSet.has(v.popup_product_id));
  const variantIds = variants.map((v) => v.id);

  const variantIdSet = new Set(variantIds);
  const units = allEventUnits.filter((u) => variantIdSet.has(u.popup_variant_id));

  const variantsByProduct = new Map<string, typeof variants>();
  for (const v of variants) {
    const list = variantsByProduct.get(v.popup_product_id) ?? [];
    list.push(v);
    variantsByProduct.set(v.popup_product_id, list);
  }
  const unitsByVariant = new Map<string, typeof units>();
  for (const u of units) {
    const list = unitsByVariant.get(u.popup_variant_id) ?? [];
    list.push(u);
    unitsByVariant.set(u.popup_variant_id, list);
  }

  const items = products.map((p) => {
    const productVariants = variantsByProduct.get(p.id) ?? [];
    let detailUnitCode: string | null = null;

    // Group variants by their size label first — a product can have more than
    // one variant row for the same size (e.g. separate rows per colour), and
    // those must collapse into a single chip with a combined count, not one
    // chip per variant.
    const variantsBySizeLabel = new Map<string, typeof productVariants>();
    for (const v of productVariants) {
      const key = normalizeSizeLabel(v.size) ?? "";
      const list = variantsBySizeLabel.get(key) ?? [];
      list.push(v);
      variantsBySizeLabel.set(key, list);
    }

    const sizes: SizeAvailability[] = [...variantsBySizeLabel.entries()].map(([sizeLabel, variantsForSize]) => {
      const unitsForSize = variantsForSize.flatMap((v) => unitsByVariant.get(v.id) ?? []);
      const available = unitsForSize.filter((u) => u.status === "available");
      let status: UnitStatus | "sold_out";
      let count: number;
      if (available.length > 0) {
        status = "available";
        count = available.length;
      } else {
        const fittingRoom = unitsForSize.filter((u) => u.status === "fitting_room");
        const held = unitsForSize.filter((u) => u.status === "held");
        if (fittingRoom.length > 0) {
          status = "fitting_room";
          count = fittingRoom.length;
        } else if (held.length > 0) {
          status = "held";
          count = held.length;
        } else {
          status = "sold_out";
          count = unitsForSize.filter((u) => u.status === "sold").length;
        }
      }
      if (!detailUnitCode && unitsForSize[0]) detailUnitCode = unitsForSize[0].unit_code;
      return { size: sizeLabel || null, status, count, buyUnitCode: available[0]?.unit_code ?? null };
    });

    const prices = productVariants
      .map((v) => Number(v.popup_price ?? v.online_price ?? NaN))
      .filter((n) => !Number.isNaN(n));
    // Second image (if the product has one) drives the browse grid's
    // hover-swap. The scrape fills image_urls with every photo on the
    // brand's site; image_url is the fallback for rows that predate that.
    const images = p.image_urls?.length ? p.image_urls : p.image_url ? [p.image_url] : [];
    const { gender, category } = classifyPopupItem(p.title, p.product_type, p.handle);
    const stylePriority = getStylePriority(p.title, p.product_type);

    return {
      stylePriority,
      item: {
        productId: p.id,
        title: p.title,
        brandName: brandById.get(p.popup_brand_id)?.name ?? "Unknown",
        brandSlug: brandById.get(p.popup_brand_id)?.slug ?? "",
        imageUrls: images,
        priceGbp: prices.length ? Math.min(...prices) : null,
        // Typed by the brand, or the body fabric from the statement scraped off their site.
        fibreComposition: p.fibre_composition?.trim() || bodyFabric(splitNotes(p.care_notes).fabric),
        naturalFibrePct: p.natural_fibre_pct,
        gender,
        category,
        detailUnitCode,
        sizes,
      } satisfies CatalogueItem,
    };
  });

  // Hide products with literally zero units anywhere (detailUnitCode is only
  // ever null when no unit exists across any of the product's variants) —
  // that means the brand hasn't declared a real quantity for any size yet,
  // not that it's "sold out". These reappear on their own the moment a
  // brand declares real numbers.
  const inStock = items.filter((i) => i.item.detailUnitCode !== null);

  // Default browse order: broad-appeal casualwear (tanks/skirts/dresses/
  // tees) first, then general tops/bottoms, then lingerie/accessories last
  // — see getStylePriority. Stable secondary sort by title.
  return inStock
    .sort((a, b) => a.stylePriority - b.stylePriority || a.item.title.localeCompare(b.item.title))
    .map((i) => i.item);
}

export type ProductDetail = {
  product: {
    id: string;
    title: string;
    image_urls: string[];
    fibre_composition: string | null;
    natural_fibre_pct: number | null;
    care_notes: string | null;
    sizing_notes: string | null;
  };
  brand: {
    name: string;
    story: string | null;
    logo_url: string | null;
    instagram_handle: string | null;
  };
  price_gbp: number | null;
  sizes: Array<{
    size: string | null;
    status: UnitStatus | "sold_out";
    available_count: number;
    buy_unit_code: string | null;
    /** Every garment of this size that can be bought right now, so a shopper can take more than one. */
    available_unit_codes: string[];
  }>;
};

export type TagDetail = ProductDetail & {
  unit: { code: string; status: UnitStatus; size: string | null; colour: string | null };
};

/**
 * Shared by getTagDetail and getProductDetail: everything about a product
 * that doesn't depend on which specific unit (if any) the shopper arrived
 * from — brand/composition/care plus every size's live status.
 */
async function getProductCore(productId: string): Promise<ProductDetail | null> {
  const { data: product, error: productError } = await fromPopup("popup_products")
    .select(
      "id, title, image_urls, image_url, fibre_composition, natural_fibre_pct, care_notes, sizing_notes, popup_brand_id"
    )
    .eq("id", productId)
    .maybeSingle();
  if (productError) throw productError;
  if (!product) return null;

  const { data: brand, error: brandError } = await fromPopup("popup_brands")
    .select("name, brand_story, logo_url, instagram_handle")
    .eq("id", product.popup_brand_id)
    .single();
  if (brandError) throw brandError;

  const { data: siblingVariants, error: siblingError } = await fromPopup("popup_variants")
    .select("id, size, popup_price, online_price")
    .eq("popup_product_id", product.id);
  if (siblingError) throw siblingError;

  const variantIds = (siblingVariants ?? []).map((v) => v.id);
  const { data: allUnits, error: allUnitsError } = await fromPopup("popup_units")
    .select("unit_code, status, popup_variant_id")
    .in("popup_variant_id", variantIds.length ? variantIds : ["00000000-0000-0000-0000-000000000000"]);
  if (allUnitsError) throw allUnitsError;

  const siblingsBySizeLabel = new Map<string, typeof siblingVariants>();
  for (const v of siblingVariants ?? []) {
    const key = normalizeSizeLabel(v.size) ?? "";
    const list = siblingsBySizeLabel.get(key) ?? [];
    list.push(v);
    siblingsBySizeLabel.set(key, list);
  }

  // XS, S, M, L, XL rather than the order the scrape happened to store them.
  const sizes = [...siblingsBySizeLabel.entries()].sort(([a], [b]) => compareSizes(a || null, b || null)).map(([sizeLabel, variantsForSize]) => {
    const unitsForSize = (allUnits ?? []).filter((u) => variantsForSize.some((v) => v.id === u.popup_variant_id));
    const available = unitsForSize.filter((u) => u.status === "available");
    let status: UnitStatus | "sold_out";
    if (available.length > 0) status = "available";
    else if (unitsForSize.some((u) => u.status === "fitting_room")) status = "fitting_room";
    else if (unitsForSize.some((u) => u.status === "held")) status = "held";
    else status = "sold_out";
    return {
      size: sizeLabel || null,
      status,
      available_count: available.length,
      buy_unit_code: available[0]?.unit_code ?? null,
      available_unit_codes: available.map((u) => u.unit_code as string),
    };
  });

  const prices = (siblingVariants ?? [])
    .map((v) => Number(v.popup_price ?? v.online_price ?? NaN))
    .filter((n) => !Number.isNaN(n));
  const images = product.image_urls?.length ? product.image_urls : product.image_url ? [product.image_url] : [];

  return {
    product: {
      id: product.id,
      title: product.title,
      image_urls: images,
      fibre_composition: product.fibre_composition?.trim() || bodyFabric(splitNotes(product.care_notes).fabric),
      natural_fibre_pct: product.natural_fibre_pct,
      care_notes: product.care_notes,
      sizing_notes: product.sizing_notes,
    },
    brand: {
      name: brand.name,
      story: brand.brand_story,
      logo_url: brand.logo_url,
      instagram_handle: brand.instagram_handle,
    },
    price_gbp: prices.length ? Math.min(...prices) : null,
    sizes,
  };
}

/**
 * Product detail for a shopper arriving from the browse-all page (clicked
 * a card, didn't scan a specific garment) — no unit/size context, so
 * nothing reads as pre-selected.
 */
export async function getProductDetail(productId: string): Promise<ProductDetail | null> {
  const event = await getActiveEvent();
  await releaseExpiredHolds(event.id);
  return getProductCore(productId);
}

/**
 * Everything the tag QR page shows: this garment's own details plus a live
 * status per size of the same product, each with a buyable unit code if
 * available.
 */
export async function getTagDetail(unitCode: string): Promise<TagDetail | null> {
  const { data: unit, error: unitError } = await fromPopup("popup_units")
    .select("id, event_id, status, popup_variant_id")
    .eq("unit_code", unitCode.toUpperCase())
    .maybeSingle();
  if (unitError) throw unitError;
  if (!unit) return null;

  await releaseExpiredHolds(unit.event_id);
  const { data: freshUnit, error: freshError } = await fromPopup("popup_units")
    .select("status")
    .eq("id", unit.id)
    .single();
  if (freshError) throw freshError;

  const { data: variant, error: variantError } = await fromPopup("popup_variants")
    .select("size, colour, popup_price, online_price, popup_product_id")
    .eq("id", unit.popup_variant_id)
    .single();
  if (variantError) throw variantError;

  const core = await getProductCore(variant.popup_product_id);
  if (!core) return null;

  return {
    unit: {
      code: unitCode.toUpperCase(),
      status: freshUnit.status as UnitStatus,
      size: variant.size,
      colour: variant.colour,
    },
    ...core,
    // The scanned unit's own price takes precedence over the product-wide minimum.
    price_gbp: variant.popup_price ?? variant.online_price ?? core.price_gbp,
  };
}

export type SpareUnit = {
  unitCode: string;
  productId: string;
  title: string;
  brandName: string;
  size: string | null;
  colour: string | null;
  priceGbp: number;
  imageUrl: string | null;
};

/**
 * "One more of these" for the bag: another available garment of the same
 * product and size as `unitCode`, skipping any the shopper already has.
 * Null when every one is taken. Unlike the till, never invents stock.
 */
export async function findSpareUnit(unitCode: string, excludeCodes: string[]): Promise<SpareUnit | null> {
  const { data: unit, error } = await fromPopup("popup_units")
    .select("event_id, popup_variant_id")
    .eq("unit_code", unitCode.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!unit) return null;
  await releaseExpiredHolds(unit.event_id);

  const { data: variant } = await fromPopup("popup_variants")
    .select("id, size, colour, popup_price, online_price, popup_product_id")
    .eq("id", unit.popup_variant_id)
    .single();
  if (!variant) return null;
  // Same product and the same size label, across colour-split variant rows.
  const wanted = normalizeSizeLabel(variant.size);
  const { data: siblings } = await fromPopup("popup_variants")
    .select("id, size, colour, popup_price, online_price")
    .eq("popup_product_id", variant.popup_product_id);
  const variantIds = (siblings ?? []).filter((v) => normalizeSizeLabel(v.size) === wanted).map((v) => v.id);

  const exclude = new Set(excludeCodes.map((c) => c.toUpperCase()));
  const { data: units } = await fromPopup("popup_units")
    .select("unit_code, popup_variant_id")
    .in("popup_variant_id", variantIds.length ? variantIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("status", "available")
    .order("unit_code");
  const spare = (units ?? []).find((u) => !exclude.has(u.unit_code as string));
  if (!spare) return null;

  const { data: product } = await fromPopup("popup_products")
    .select("id, title, image_url, image_urls, popup_brand_id")
    .eq("id", variant.popup_product_id)
    .single();
  const { data: brand } = await fromPopup("popup_brands").select("name").eq("id", product?.popup_brand_id).single();
  const priced = (siblings ?? []).find((v) => v.id === spare.popup_variant_id) ?? variant;
  return {
    unitCode: spare.unit_code as string,
    productId: product?.id as string,
    title: product?.title as string,
    brandName: (brand?.name as string) ?? "",
    size: wanted,
    colour: priced.colour ?? variant.colour ?? null,
    priceGbp: Number(priced.popup_price ?? priced.online_price ?? 0),
    imageUrl: product?.image_urls?.[0] ?? product?.image_url ?? null,
  };
}
