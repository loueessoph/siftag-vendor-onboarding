/**
 * Reading and validating a brand's selection. Shared by the selector, the
 * submit endpoint and the progress lines, so the vendor is never told their
 * list is fine by one screen and rejected by another.
 */

import { supabaseAdmin } from "./supabase/server";
import { MINIMUM_NATURAL_PCT } from "./fibre";

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
};

export type SelectorProduct = {
  id: string;
  title: string;
  imageUrl: string | null;
  productType: string | null;
  colour: string | null;
  fibreComposition: string | null;
  naturalFibrePct: number | null;
  approvalStatus: string;
  approvalNote: string | null;
  variants: SelectorVariant[];
};

export async function getSelectorProducts(
  brandId: string
): Promise<SelectorProduct[]> {
  const { data, error } = await supabaseAdmin()
    .from("popup_products")
    .select(
      "id, title, image_url, product_type, fibre_composition, natural_fibre_pct, approval_status, approval_note, popup_variants(id, sku, vendor_sku, size, colour, online_price, popup_price, selected, quantity_declared)"
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
      }))
      .sort((a, b) => sizeOrder(a.size) - sizeOrder(b.size));

    return {
      id: p.id,
      title: p.title,
      imageUrl: p.image_url,
      productType: p.product_type,
      // Colourways are published as separate products by some brands, so the
      // product's colour is whatever its variants agree on.
      colour: variants[0]?.colour ?? null,
      fibreComposition: p.fibre_composition,
      naturalFibrePct:
        p.natural_fibre_pct == null ? null : Number(p.natural_fibre_pct),
      approvalStatus: p.approval_status,
      approvalNote: p.approval_note,
      variants,
    };
  });
}

const SIZE_RANK = ["xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl"];

/** Sizes should read XS, S, M, L, XL — not alphabetically. */
function sizeOrder(size: string | null): number {
  if (!size) return 999;
  const index = SIZE_RANK.indexOf(size.trim().toLowerCase());
  if (index !== -1) return index;
  const numeric = Number(size.replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? 100 + numeric : 998;
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

  for (const product of chosen) {
    if (!product.fibreComposition?.trim()) {
      issues.push({
        productId: product.id,
        title: product.title,
        reason: "Needs fibre composition",
      });
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

    const selectedVariants = product.variants.filter((v) => v.selected);
    if (selectedVariants.some((v) => !v.quantityDeclared)) {
      issues.push({
        productId: product.id,
        title: product.title,
        reason: "Some sizes have no quantity",
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
    canSubmit: chosen.length > 0 && issues.length === 0,
  };
}
