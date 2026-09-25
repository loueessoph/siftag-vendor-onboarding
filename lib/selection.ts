/**
 * Reading and validating a brand's selection. Shared by the selector, the
 * submit endpoint and the progress lines, so the vendor is never told their
 * list is fine by one screen and rejected by another.
 */

import { sizeBase, sizeQualifierRank } from "./sizes";
import { supabaseAdmin } from "./supabase/server";
import { MINIMUM_NATURAL_PCT, readComposition, splitNotes } from "./fibre";
import { isCustomProduct } from "./custom-items";
import { productUrl } from "./catalogue";

export type SelectorVariant = {
  id: string;
  sku: string | null;
  vendorSku: string | null;
  size: string | null;
  colour: string | null;
  onlinePrice: number | null;
  popupPrice: number | null;
  selected: boolean;
  quantityDeclared: number | null;
  /** Added by the brand rather than scraped; can be removed. */
  custom: boolean;
};

export type SelectorProduct = {
  id: string;
  title: string;
  imageUrl: string | null;
  productType: string | null;
  colour: string | null;
  fibreComposition: string | null;
  naturalFibrePct: number | null;
  /** The brand's own note about the item: care, sizing, anything for us. */
  notes: string | null;
  /** Added by the brand by hand rather than scraped; can be removed. */
  custom: boolean;
  /** The item on the brand's own website, where there is a page for it. */
  url: string | null;
  approvalStatus: string;
  approvalNote: string | null;
  variants: SelectorVariant[];
};

export async function getSelectorProducts(
  brand: { id: string; shopify_domain: string | null; contact_email: string }
): Promise<SelectorProduct[]> {
  const brandId = brand.id;
  const { data, error } = await supabaseAdmin()
    .from("popup_products")
    .select(
      "id, title, handle, image_url, product_type, shopify_product_id, fibre_composition, natural_fibre_pct, care_notes, approval_status, approval_note, popup_variants(id, sku, vendor_sku, shopify_variant_id, size, colour, online_price, popup_price, selected, quantity_declared)"
    )
    .eq("popup_brand_id", brandId)
    .eq("is_excluded", false)
    .order("title");
  if (error) throw error;

  return (data ?? []).map((p) => {
    const variants = ((p.popup_variants ?? []) as Record<string, unknown>[])
      .map((v) => ({
        id: v.id as string,
        sku: (v.sku as string) ?? null,
        vendorSku: (v.vendor_sku as string) ?? null,
        size: (v.size as string) ?? null,
        colour: (v.colour as string) ?? null,
        onlinePrice: v.online_price == null ? null : Number(v.online_price),
        popupPrice: v.popup_price == null ? null : Number(v.popup_price),
        selected: Boolean(v.selected),
        quantityDeclared:
          v.quantity_declared == null ? null : Number(v.quantity_declared),
        custom: isCustomProduct((v.shopify_variant_id as string | null) ?? null),
      }))
      // Colour first where a product carries several, then size within it.
      .sort(
        (a, b) =>
          (a.colour ?? "").localeCompare(b.colour ?? "") ||
          compareSizes(a.size, b.size)
      );

    return {
      id: p.id,
      title: p.title,
      imageUrl: p.image_url,
      productType: p.product_type,
      // Colourways are published as separate products by some brands, so the
      // product's colour is whatever its variants agree on. Where they don't
      // agree, the card says how many and each size row names its colour.
      colour: productColour(variants),
      fibreComposition: p.fibre_composition,
      naturalFibrePct:
        p.natural_fibre_pct == null ? null : Number(p.natural_fibre_pct),
      notes: p.care_notes,
      custom: isCustomProduct(p.shopify_product_id),
      url: productUrl(brand, p),
      approvalStatus: p.approval_status,
      approvalNote: p.approval_note,
      variants,
    };
  });
}

const SIZE_RANK = ["xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl"];

/**
 * Sizes should read XS, S, M, L, XL, not alphabetically; numbers in order;
 * anything unrecognised last. Use `compareSizes` to sort: it breaks ties on
 * the rest of the label so "S Reg" and "S Long" keep a stable order.
 */
export function sizeOrder(size: string | null): number {
  if (!size) return 999;
  // "S Reg", "XS Long": rank on the size itself; the length is a tie-break.
  const index = SIZE_RANK.indexOf(sizeBase(size).toLowerCase().split(/[\s/]+/)[0]);
  if (index !== -1) return index;
  const numeric = Number(size.replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? 100 + numeric : 998;
}

function productColour(variants: { colour: string | null }[]): string | null {
  const colours = [...new Set(variants.map((v) => v.colour).filter(Boolean))] as string[];
  if (colours.length === 0) return null;
  if (colours.length === 1) return colours[0];
  return colours.length <= 3 ? colours.join(" / ") : `${colours.length} colours`;
}

export function compareSizes(a: string | null, b: string | null): number {
  return sizeOrder(a) - sizeOrder(b) || sizeQualifierRank(a) - sizeQualifierRank(b) || (a ?? "").localeCompare(b ?? "");
}

export type SelectionIssue = {
  productId: string;
  title: string;
  reason: string;
};

export type SelectionSummary = {
  selectedProducts: number;
  selectedVariants: number;
  totalUnits: number;
  issues: SelectionIssue[];
  /** Worth a look but not a blocker: a ticked size with no quantity is left out. */
  warnings: SelectionIssue[];
  canSubmit: boolean;
};

/**
 * The single definition of "is this list finished". The selector shows these
 * inline as the vendor types; submit refuses on exactly the same list, so
 * nothing can pass one and fail the other.
 */
export function summarise(products: SelectorProduct[]): SelectionSummary {
  const chosen = products.filter((p) => p.variants.some((v) => v.selected));
  const issues: SelectionIssue[] = [];
  const warnings: SelectionIssue[] = [];

  for (const product of chosen) {
    const fabricNote = splitNotes(product.notes).fabric;
    if (!product.fibreComposition?.trim()) {
      // An itemised statement from their website stands in: we have the
      // fibres, just not as one line. Reviewers see it on the card.
      if (!fabricNote) {
        issues.push({
          productId: product.id,
          title: product.title,
          reason: "Fibre composition isn't finished: pick a fibre and its percentage",
        });
      }
    } else if (product.naturalFibrePct == null) {
      issues.push({
        productId: product.id,
        title: product.title,
        reason: "Needs a natural fibre percentage",
      });
    } else if (product.naturalFibrePct < MINIMUM_NATURAL_PCT) {
      issues.push({
        productId: product.id,
        title: product.title,
        reason: `${product.naturalFibrePct}% natural: the event needs at least ${MINIMUM_NATURAL_PCT}%`,
      });
    }

    if (
      product.fibreComposition &&
      readComposition(product.fibreComposition).incomplete
    ) {
      warnings.push({
        productId: product.id,
        title: product.title,
        reason: "fibre composition doesn't add up to 100%, so please check it",
      });
    }

    const selectedVariants = product.variants.filter((v) => v.selected);
    // A ticked size with no quantity is treated as not coming, not as an
    // error: brands tick a product then decide sizes, and "0" is an answer.
    const blank = selectedVariants.filter((v) => !v.quantityDeclared);
    if (blank.length === selectedVariants.length) {
      issues.push({
        productId: product.id,
        title: product.title,
        reason: "No quantities yet: add how many of at least one size",
      });
    } else if (blank.length > 0) {
      warnings.push({
        productId: product.id,
        title: product.title,
        reason: `${blank.map((v) => v.size ?? "One size").join(", ")}: no quantity, so ${
          blank.length === 1 ? "it" : "they"
        } won't be included`,
      });
    }
    if (selectedVariants.some((v) => v.popupPrice == null)) {
      issues.push({
        productId: product.id,
        title: product.title,
        reason: "Some sizes have no price",
      });
    }
  }

  const selectedVariants = chosen.flatMap((p) =>
    p.variants.filter((v) => v.selected)
  );

  return {
    selectedProducts: chosen.length,
    selectedVariants: selectedVariants.length,
    totalUnits: selectedVariants.reduce(
      (sum, v) => sum + (v.quantityDeclared ?? 0),
      0
    ),
    issues,
    warnings,
    canSubmit: chosen.length > 0 && issues.length === 0,
  };
}
