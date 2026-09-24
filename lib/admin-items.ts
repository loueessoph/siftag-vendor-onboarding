/**
 * Every sellable item as the admin sees it: what the shopper sees on the
 * card, plus each size's garments with their tag code and live status.
 * Only what will be on the floor: rejected products are left out, as they
 * are from tags and the storefront. Products with no stock yet still show,
 * so staff can see what a brand has ticked but not declared.
 */

import { fromPopup } from "./supabase/server";
import { fetchAllRows } from "./supabase/fetch-all";
import { getActiveEvent, releaseExpiredHolds, type UnitStatus } from "./live-event";
import { normalizeSizeLabel } from "./sizes";
import { compareSizes } from "./selection";
import { bodyFabric, splitNotes } from "./fibre";

export type AdminUnit = { code: string; status: UnitStatus };
export type AdminSize = { size: string | null; colour: string | null; sku: string | null; units: AdminUnit[] };
export type AdminItem = {
  productId: string;
  title: string;
  brandName: string;
  brandSlug: string;
  imageUrl: string | null;
  fibreComposition: string | null;
  priceGbp: number | null;
  approval: string;
  sizes: AdminSize[];
  counts: Record<UnitStatus, number>;
};

export async function listAdminItems(): Promise<AdminItem[]> {
  const event = await getActiveEvent();
  await releaseExpiredHolds(event.id);

  const { data: brands, error: bErr } = await fromPopup("popup_brands").select("id, name, slug");
  if (bErr) throw bErr;
  const brandById = new Map((brands ?? []).map((b) => [b.id as string, b as { name: string; slug: string }]));

  const [products, variants, units] = await Promise.all([
    fetchAllRows<{
      id: string;
      title: string;
      image_url: string | null;
      image_urls: string[] | null;
      fibre_composition: string | null;
      care_notes: string | null;
      approval_status: string;
      popup_brand_id: string;
    }>("popup_products", "id, title, image_url, image_urls, fibre_composition, care_notes, approval_status, popup_brand_id", (q) =>
      q.eq("is_excluded", false).neq("approval_status", "rejected")
    ),
    fetchAllRows<{
      id: string;
      size: string | null;
      colour: string | null;
      sku: string | null;
      popup_price: number | null;
      online_price: number | null;
      popup_product_id: string;
    }>("popup_variants", "id, size, colour, sku, popup_price, online_price, popup_product_id", (q) => q.eq("selected", true)),
    fetchAllRows<{ unit_code: string; status: UnitStatus; popup_variant_id: string }>("popup_units", "unit_code, status, popup_variant_id", (q) =>
      q.eq("event_id", event.id)
    ),
  ]);

  const unitsByVariant = new Map<string, AdminUnit[]>();
  for (const u of units) {
    const list = unitsByVariant.get(u.popup_variant_id) ?? [];
    list.push({ code: u.unit_code, status: u.status });
    unitsByVariant.set(u.popup_variant_id, list);
  }
  const variantsByProduct = new Map<string, typeof variants>();
  for (const v of variants) {
    const list = variantsByProduct.get(v.popup_product_id) ?? [];
    list.push(v);
    variantsByProduct.set(v.popup_product_id, list);
  }

  const items: AdminItem[] = [];
  for (const p of products) {
    const vs = variantsByProduct.get(p.id) ?? [];
    if (vs.length === 0) continue; // nothing ticked: not coming to the pop-up
    const brand = brandById.get(p.popup_brand_id);
    const sizes: AdminSize[] = vs
      .map((v) => ({
        size: normalizeSizeLabel(v.size),
        colour: v.colour?.trim() || null,
        sku: v.sku,
        units: [...(unitsByVariant.get(v.id) ?? [])].sort((a, b) => a.code.localeCompare(b.code)),
      }))
      .sort((a, b) => compareSizes(a.size, b.size) || (a.colour ?? "").localeCompare(b.colour ?? ""));
    const counts: Record<UnitStatus, number> = { available: 0, held: 0, fitting_room: 0, sold: 0 };
    for (const s of sizes) for (const u of s.units) counts[u.status]++;
    const prices = vs.map((v) => Number(v.popup_price ?? v.online_price ?? NaN)).filter((n) => !Number.isNaN(n));
    items.push({
      productId: p.id,
      title: p.title,
      brandName: brand?.name ?? "Unknown",
      brandSlug: brand?.slug ?? "",
      imageUrl: p.image_urls?.[0] ?? p.image_url ?? null,
      fibreComposition: p.fibre_composition?.trim() || bodyFabric(splitNotes(p.care_notes).fabric),
      priceGbp: prices.length ? Math.min(...prices) : null,
      approval: p.approval_status,
      sizes,
      counts,
    });
  }
  return items.sort((a, b) => a.brandName.localeCompare(b.brandName) || a.title.localeCompare(b.title));
}
