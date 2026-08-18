"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createBrand, getBrand } from "@/lib/brands";
import { ingestCatalogue, SubmittedListError } from "@/lib/ingest";
import { CsvFormatError, productsFromCsv } from "@/lib/csv";
import { updateBrandTerms } from "@/lib/brands";

function optional(form: FormData, key: string): string | null {
  const value = String(form.get(key) ?? "").trim();
  return value.length > 0 ? value : null;
}

function money(form: FormData, key: string): number | null {
  const raw = optional(form, key);
  if (raw === null) return null;
  const n = Number(raw.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function createBrandAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();
  const feeGbp = money(formData, "fee_gbp");

  if (!name || !contactEmail || feeGbp === null) {
    redirect("/admin/brands/new?error=required");
  }

  const brand = await createBrand({
    name,
    legalName: optional(formData, "legal_name"),
    contactName: optional(formData, "contact_name"),
    contactEmail,
    shopifyDomain: optional(formData, "shopify_domain"),
    isInternational: formData.get("is_international") === "on",
    feeGbp,
    depositGbp: money(formData, "deposit_gbp"),
    balanceTerms: optional(formData, "balance_terms"),
    commissionPct: money(formData, "commission_pct") ?? 10,
    paymentTermsNote: null,
    vatStatus: null,
  });

  // A CSV dropped on the form is the whole catalogue for a non-Shopify brand,
  // so it is imported straight away rather than left as a second chore.
  const csv = formData.get("catalogue_csv");
  if (csv instanceof File && csv.size > 0) {
    try {
      const products = productsFromCsv(await csv.text());
      await ingestCatalogue(brand.id, brand.brand_code, products);
    } catch (error) {
      const message =
        error instanceof CsvFormatError ? error.message : "Could not read that CSV.";
      revalidatePath("/admin");
      redirect(
        `/admin/brands/${brand.id}?created=1&error=${encodeURIComponent(message)}`
      );
    }
  }

  revalidatePath("/admin");
  redirect(`/admin/brands/${brand.id}?created=1`);
}

/** Editing terms after the fact. Reflected on the vendor's page immediately. */
export async function updateBrandAction(formData: FormData) {
  const brandId = String(formData.get("brand_id") ?? "");
  const feeGbp = money(formData, "fee_gbp");
  if (!brandId || feeGbp === null) {
    redirect(`/admin/brands/${brandId}?error=required`);
  }

  await updateBrandTerms(brandId, {
    name: String(formData.get("name") ?? "").trim(),
    legalName: optional(formData, "legal_name"),
    contactName: optional(formData, "contact_name"),
    contactEmail: String(formData.get("contact_email") ?? "").trim(),
    shopifyDomain: optional(formData, "shopify_domain"),
    isInternational: formData.get("is_international") === "on",
    feeGbp,
    depositGbp: money(formData, "deposit_gbp"),
    balanceTerms: optional(formData, "balance_terms"),
    commissionPct: money(formData, "commission_pct") ?? 10,
  });

  revalidatePath(`/admin/brands/${brandId}`);
  revalidatePath("/admin");
  redirect(`/admin/brands/${brandId}?updated=1`);
}

export async function scrapeBrandAction(formData: FormData) {
  const brandId = String(formData.get("brand_id") ?? "");
  const brand = await getBrand(brandId);

  if (!brand) redirect("/admin?error=missing-brand");
  if (!brand.shopify_domain) {
    redirect(`/admin/brands/${brandId}?error=no-domain`);
  }

  try {
    const result = await ingestCatalogue(
      brand.id,
      brand.brand_code,
      brand.shopify_domain
    );
    revalidatePath(`/admin/brands/${brandId}`);
    redirect(
      `/admin/brands/${brandId}?scraped=${result.productsAdded}.${result.productsUpdated}.${result.variantsAdded}.${result.excluded}`
    );
  } catch (error) {
    // redirect() throws by design — don't swallow it as a scrape failure.
    if (error && typeof error === "object" && "digest" in error) throw error;
    const message =
      error instanceof SubmittedListError
        ? error.message
        : error instanceof Error
        ? error.message
        : "Scrape failed.";
    redirect(
      `/admin/brands/${brandId}?error=${encodeURIComponent(message.slice(0, 200))}`
    );
  }
}
