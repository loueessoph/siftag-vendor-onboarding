/**
 * Approving what a brand submitted.
 *
 * The decision lives on the product (`approval_status`, `approval_note`),
 * because that is what the vendor sees in their selector and what the tag
 * printer reads. The items reviewed come from the brand's submission
 * snapshot, so what admin is looking at is exactly what the brand pressed
 * the button on, sizes and quantities included, even if they have edited
 * since.
 */

import { supabaseAdmin } from "./supabase/server";
import { MINIMUM_NATURAL_PCT, readComposition } from "./fibre";
import { isCustomProduct } from "./custom-items";
import { productUrl } from "./catalogue";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type SubmittedVariant = {
  sku: string;
  size: string | null;
  colour: string | null;
  quantity: number;
  popupPrice: number | null;
  onlinePrice: number | null;
};

export type SubmittedProduct = {
  /** Null when the product has since been deleted from the catalogue. */
  productId: string | null;
  title: string;
  colour: string | null;
  imageUrl: string | null;
  fibreComposition: string | null;
  naturalFibrePct: number | null;
  approvalStatus: ApprovalStatus;
  approvalNote: string | null;
  /** What the brand wrote about the item, if anything. */
  vendorNotes: string | null;
  /** Added by the brand by hand rather than scraped from their site. */
  custom: boolean;
  /** The item on the brand's own website, where there is a page for it. */
  url: string | null;
  variants: SubmittedVariant[];
};

export type SubmissionReview = {
  submissionId: string;
  submittedAt: string;
  products: SubmittedProduct[];
  counts: Record<ApprovalStatus, number>;
};

type ItemRow = {
  sku: string;
  product_title: string;
  size: string | null;
  colour: string | null;
  fibre_composition: string | null;
  natural_fibre_pct: number | string | null;
  online_price: number | string | null;
  popup_price: number | string | null;
  quantity_declared: number | null;
  popup_variants: {
    popup_product_id: string;
    popup_products: {
      id: string;
      image_url: string | null;
      approval_status: ApprovalStatus;
      approval_note: string | null;
      care_notes: string | null;
      shopify_product_id: string | null;
      handle: string | null;
    } | null;
  } | null;
};

const num = (v: number | string | null) => (v == null ? null : Number(v));

/** The brand's current submission, grouped by product. Null if never submitted. */
export async function getSubmissionReview(
  brandId: string
): Promise<SubmissionReview | null> {
  const db = supabaseAdmin();
  const { data: brand } = await db
    .from("popup_brands")
    .select("shopify_domain, contact_email")
    .eq("id", brandId)
    .single();

  const { data: submission, error: subError } = await db
    .from("popup_submissions")
    .select("id, submitted_at")
    .eq("popup_brand_id", brandId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subError) throw subError;
  if (!submission) return null;

  const { data: items, error: itemsError } = await db
    .from("popup_submission_items")
    .select(
      "sku, product_title, size, colour, fibre_composition, natural_fibre_pct, online_price, popup_price, quantity_declared, popup_variants(popup_product_id, popup_products(id, image_url, approval_status, approval_note, care_notes, shopify_product_id, handle))"
    )
    .eq("popup_submission_id", submission.id)
    .order("product_title");
  if (itemsError) throw itemsError;

  const byProduct = new Map<string, SubmittedProduct>();
  for (const raw of (items ?? []) as unknown as ItemRow[]) {
    const product = raw.popup_variants?.popup_products ?? null;
    const key = product?.id ?? `deleted:${raw.product_title}`;
    let group = byProduct.get(key);
    if (!group) {
      group = {
        productId: product?.id ?? null,
        title: raw.product_title,
        colour: raw.colour,
        imageUrl: product?.image_url ?? null,
        fibreComposition: raw.fibre_composition,
        naturalFibrePct: num(raw.natural_fibre_pct),
        approvalStatus: product?.approval_status ?? "pending",
        approvalNote: product?.approval_note ?? null,
        vendorNotes: product?.care_notes?.trim() || null,
        custom: isCustomProduct(product?.shopify_product_id ?? null),
        url:
          brand && product
            ? productUrl(brand, {
                shopify_product_id: product.shopify_product_id,
                handle: product.handle,
              })
            : null,
        variants: [],
      };
      byProduct.set(key, group);
    }
    group.variants.push({
      sku: raw.sku,
      size: raw.size,
      colour: raw.colour,
      quantity: raw.quantity_declared ?? 0,
      popupPrice: num(raw.popup_price),
      onlinePrice: num(raw.online_price),
    });
  }

  const products = [...byProduct.values()];
  const counts: Record<ApprovalStatus, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };
  for (const p of products) counts[p.approvalStatus]++;

  return {
    submissionId: submission.id,
    submittedAt: submission.submitted_at,
    products,
    counts,
  };
}

/** Reasons a reviewer should hesitate, shown next to the buttons. */
export function reviewFlags(product: SubmittedProduct): string[] {
  const flags: string[] = [];
  if (!product.fibreComposition) flags.push("No fibre composition given");
  else if (product.naturalFibrePct == null) {
    flags.push("Natural fibre share couldn't be read");
  } else if (product.naturalFibrePct < MINIMUM_NATURAL_PCT) {
    flags.push(
      `${product.naturalFibrePct}% natural, below the ${MINIMUM_NATURAL_PCT}% rule`
    );
  }
  if (
    product.fibreComposition &&
    readComposition(product.fibreComposition).incomplete
  ) {
    flags.push("Composition doesn't add up to 100%");
  }
  if (product.variants.some((v) => v.popupPrice == null)) {
    flags.push("A size has no pop-up price");
  }
  if (product.variants.every((v) => v.quantity === 0)) {
    flags.push("No quantity declared");
  }
  return flags;
}

export async function setApproval(
  brandId: string,
  productId: string,
  status: ApprovalStatus,
  note: string | null
): Promise<void> {
  // Scoped by brand as well as id, so a form on one brand's page can't
  // decide another brand's product.
  const { data, error } = await supabaseAdmin()
    .from("popup_products")
    .update({ approval_status: status, approval_note: note })
    .eq("id", productId)
    .eq("popup_brand_id", brandId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Product not found for this brand.");
}

/** Every brand with a submission, for the queue page. */
export async function listSubmissionReviews(): Promise<
  { brandId: string; brandName: string; brandCode: string; review: SubmissionReview }[]
> {
  const db = supabaseAdmin();
  const { data: brands, error } = await db
    .from("popup_brands")
    .select("id, name, brand_code")
    .not("submitted_at", "is", null)
    .order("name");
  if (error) throw error;

  const out = [];
  for (const b of brands ?? []) {
    const review = await getSubmissionReview(b.id);
    if (review) {
      out.push({
        brandId: b.id,
        brandName: b.name,
        brandCode: b.brand_code,
        review,
      });
    }
  }
  return out;
}
