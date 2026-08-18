/**
 * Vendor-side reads and writes. Everything here runs server-side under the
 * service role: vendor pages are unauthenticated and identified only by the
 * token in the URL, so the browser never holds a database credential.
 */

import { supabaseAdmin } from "./supabase/server";
import { catalogueStats, type BrandRow } from "./brands";
import type { AgreementVars } from "@/content/agreement";
import { KEY_DATES, formatDate } from "./dates";
import { plural } from "./format";
import type { StepSlug, VendorProgress } from "./steps";

export type VendorContext = {
  brand: BrandRow;
  progress: VendorProgress;
  agreementVars: AgreementVars;
};

/**
 * Looks a brand up by its token. The slug in the URL is decoration — it makes
 * the link readable in an email, but it is never trusted, so a right token
 * with a wrong slug still resolves and a guessed slug alone gets nothing.
 */
export async function getVendorByToken(
  token: string
): Promise<VendorContext | null> {
  const { data, error } = await supabaseAdmin()
    .from("popup_brands")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const brand = data as BrandRow;
  const stats = await catalogueStats(brand.id);

  return {
    brand,
    progress: buildProgress(brand, stats),
    agreementVars: {
      brandLegalName: brand.legal_name || brand.name,
      feeGbp: Number(brand.fee_gbp),
      depositGbp: brand.deposit_gbp == null ? null : Number(brand.deposit_gbp),
      balanceTerms: brand.balance_terms,
      commissionPct: Number(brand.commission_pct),
      catalogueDeadline: `${formatDate(KEY_DATES.productList)} 2026`,
    },
  };
}

function buildProgress(
  brand: BrandRow,
  stats: Awaited<ReturnType<typeof catalogueStats>>
): VendorProgress {
  const signed = brand.agreement_status === "signed";

  const products: VendorProgress[StepSlug] =
    brand.submission_status === "submitted"
      ? {
          state: "locked",
          detail: `${plural(stats.selectedProducts, "item")} submitted${
            brand.submitted_at
              ? ` ${formatDate(brand.submitted_at.slice(0, 10))}`
              : ""
          }`,
        }
      : stats.products === 0
      ? { state: "todo", detail: "We're still loading your catalogue." }
      : stats.selectedProducts === 0
      ? {
          state: "todo",
          detail: `${plural(stats.products, "product")} ready for you to pick from.`,
        }
      : {
          state: "in_progress",
          detail: `${plural(stats.selectedProducts, "item")} selected${
            stats.missingComposition > 0
              ? ` · ${stats.missingComposition} still need fibre composition`
              : " · nothing missing"
          }`,
        };

  return {
    agreement: signed
      ? {
          state: "done",
          detail: `Signed ${
            brand.agreement_signed_at
              ? formatDate(brand.agreement_signed_at.slice(0, 10))
              : ""
          }${
            brand.agreement_signed_name
              ? ` by ${brand.agreement_signed_name}`
              : ""
          }`,
        }
      : { state: "todo" },
    products,
    stock: { state: "todo" },
    marketing: { state: "todo" },
  };
}

/**
 * Records that a brand looked at their hub. This is what tells apart a brand
 * who never clicked the link from one who started and stalled — two different
 * reminder emails, and two different people to worry about on 3 September.
 */
export async function markOpened(brand: BrandRow): Promise<void> {
  const patch: Record<string, string> = {
    last_opened_at: new Date().toISOString(),
  };
  if (brand.submission_status === "not_opened") patch.submission_status = "opened";

  const { error } = await supabaseAdmin()
    .from("popup_brands")
    .update(patch)
    .eq("id", brand.id);
  if (error) throw error;
}

export type SignatureInput = {
  name: string;
  title: string;
  email: string;
  vatNumber: string | null;
  agreementVersion: string;
  ip: string | null;
  userAgent: string | null;
};

/**
 * A typed name is a valid electronic signature, but only defensible if we can
 * show who signed, when, and which words they were shown — hence the version
 * string alongside the timestamp. Refuses to overwrite an existing signature.
 */
export async function recordSignature(
  brandId: string,
  input: SignatureInput
): Promise<void> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("popup_brands")
    .update({
      agreement_status: "signed",
      agreement_version: input.agreementVersion,
      agreement_signed_at: new Date().toISOString(),
      agreement_signed_name: input.name,
      agreement_signed_title: input.title,
      agreement_signed_email: input.email,
      vat_number: input.vatNumber,
      agreement_signed_ip: input.ip,
      agreement_signed_user_agent: input.userAgent,
    })
    .eq("id", brandId)
    .eq("agreement_status", "unsigned")
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("This agreement has already been signed.");
  }
}

/**
 * A shipment the brand says is on its way. Created without received_at: that
 * gets filled in at check-in, and the gap between the two is what tells us
 * what we're still waiting for.
 */
export async function declareDispatch(
  brandId: string,
  input: { boxCount: number; trackingReference: string | null }
): Promise<void> {
  const { error } = await supabaseAdmin().from("popup_deliveries").insert({
    popup_brand_id: brandId,
    box_count: input.boxCount,
    tracking_reference: input.trackingReference,
    declared_by_vendor: true,
    declared_at: new Date().toISOString(),
    received_at: null,
  });
  if (error) throw error;
}

export async function listDeliveries(brandId: string) {
  const { data, error } = await supabaseAdmin()
    .from("popup_deliveries")
    .select("id, box_count, tracking_reference, declared_at, received_at, notes")
    .eq("popup_brand_id", brandId)
    .order("declared_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function savePostUrls(
  brandId: string,
  urls: string[]
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("popup_brands")
    .update({ post_urls: urls })
    .eq("id", brandId);
  if (error) throw error;
}

export async function saveWeekendPlans(
  brandId: string,
  input: { days: string[]; specialRequests: string | null }
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("popup_brands")
    .update({
      attending_days: input.days,
      special_requests: input.specialRequests,
    })
    .eq("id", brandId);
  if (error) throw error;
}
