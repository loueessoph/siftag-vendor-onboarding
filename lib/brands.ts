import { supabaseAdmin } from "./supabase/server";
import { normaliseDomain } from "./shopify";

export type BrandTerms = {
  feeGbp: number;
  depositGbp: number | null;
  balanceTerms: string | null;
  commissionPct: number;
  paymentTermsNote: string | null;
  vatStatus: string | null;
};

export type NewBrandInput = BrandTerms & {
  name: string;
  legalName: string | null;
  contactName: string | null;
  contactEmail: string;
  shopifyDomain: string | null;
  isInternational: boolean;
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Short code for till SKUs: SFTG-IGL-001. Initials where a name has several
 * words, otherwise the first three letters — either way something a person can
 * read off a tag and know whose it is.
 */
export function brandCodeFrom(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const code =
    words.length > 1
      ? words.map((w) => w[0]).join("")
      : (words[0] ?? "BRAND").slice(0, 3);
  return code.toUpperCase().slice(0, 6);
}

/**
 * The only thing standing between a stranger and a brand's terms and product
 * list, so it is random and long rather than derived from the name. The slug in
 * the URL is decoration; this is the credential.
 */
function mintToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64url"
  );
}

/** Appends -2, -3 … until the value is free in `column`. */
async function makeUnique(column: string, base: string): Promise<string> {
  const db = supabaseAdmin();
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}${column === "slug" ? "-" : ""}${n}`;
    const { data, error } = await db
      .from("popup_brands")
      .select("id")
      .eq(column, candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  throw new Error(`Could not find a free ${column} based on "${base}".`);
}

export async function createBrand(input: NewBrandInput) {
  const db = supabaseAdmin();

  const slug = await makeUnique("slug", slugify(input.name));
  const brandCode = await makeUnique("brand_code", brandCodeFrom(input.name));

  const { data, error } = await db
    .from("popup_brands")
    .insert({
      name: input.name,
      legal_name: input.legalName,
      slug,
      brand_code: brandCode,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      shopify_domain: input.shopifyDomain
        ? normaliseDomain(input.shopifyDomain)
        : null,
      is_international: input.isInternational,
      fee_gbp: input.feeGbp,
      deposit_gbp: input.depositGbp,
      balance_terms: input.balanceTerms,
      commission_pct: input.commissionPct,
      payment_terms_note: input.paymentTermsNote,
      vat_status: input.vatStatus,
      access_token: mintToken(),
    })
    .select("id, slug, brand_code, access_token")
    .single();
  if (error) throw error;
  return data;
}

export type BrandRow = {
  id: string;
  name: string;
  legal_name: string | null;
  slug: string;
  brand_code: string;
  contact_name: string | null;
  contact_email: string;
  shopify_domain: string | null;
  is_international: boolean;
  fee_gbp: number;
  deposit_gbp: number | null;
  balance_terms: string | null;
  commission_pct: number;
  payment_terms_note: string | null;
  vat_status: string | null;
  access_token: string;
  agreement_status: string;
  agreement_signed_at: string | null;
  agreement_signed_name: string | null;
  fee_paid_at: string | null;
  submission_status: string;
  submitted_at: string | null;
  last_opened_at: string | null;
  last_saved_at: string | null;
  vat_number: string | null;
  post_urls: string[];
  attending_days: string[];
  special_requests: string | null;
};

export async function listBrands(): Promise<BrandRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("popup_brands")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BrandRow[];
}

export async function getBrand(id: string): Promise<BrandRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("popup_brands")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as BrandRow) ?? null;
}

/** Catalogue counts for the brand page and the tracker. */
export async function catalogueStats(brandId: string) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("popup_products")
    .select("id, is_excluded, fibre_composition, popup_variants(id, selected)")
    .eq("popup_brand_id", brandId);
  if (error) throw error;

  const products = data ?? [];
  const sellable = products.filter((p) => !p.is_excluded);
  const variants = sellable.flatMap(
    (p) => (p.popup_variants ?? []) as { id: string; selected: boolean }[]
  );
  const selectedProducts = sellable.filter((p) =>
    ((p.popup_variants ?? []) as { selected: boolean }[]).some((v) => v.selected)
  );

  return {
    products: sellable.length,
    excluded: products.length - sellable.length,
    variants: variants.length,
    selectedProducts: selectedProducts.length,
    selectedVariants: variants.filter((v) => v.selected).length,
    missingComposition: selectedProducts.filter((p) => !p.fibre_composition)
      .length,
  };
}

export function vendorPath(slug: string, token: string): string {
  return `/vendor/${slug}/${token}`;
}

export type BrandTermsUpdate = {
  name: string;
  legalName: string | null;
  contactName: string | null;
  contactEmail: string;
  shopifyDomain: string | null;
  isInternational: boolean;
  feeGbp: number;
  depositGbp: number | null;
  balanceTerms: string | null;
  commissionPct: number;
};

/**
 * The slug, brand code and token are deliberately not editable. Each is
 * already out in the world: the token in a brand's inbox, the code printed on
 * tags. Changing one silently breaks a link or orphans a label.
 */
export async function updateBrandTerms(
  brandId: string,
  input: BrandTermsUpdate
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("popup_brands")
    .update({
      name: input.name,
      legal_name: input.legalName,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      shopify_domain: input.shopifyDomain
        ? normaliseDomain(input.shopifyDomain)
        : null,
      is_international: input.isInternational,
      fee_gbp: input.feeGbp,
      deposit_gbp: input.depositGbp,
      balance_terms: input.balanceTerms,
      commission_pct: input.commissionPct,
    })
    .eq("id", brandId);
  if (error) throw error;
}
