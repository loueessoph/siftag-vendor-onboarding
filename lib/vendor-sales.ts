/**
 * The vendor's sales report: what sold, when, in which sizes, and what is
 * still on the rail. Everything comes from popup_order_items joined back
 * to the order (for the time and channel) and forward to the unit, its
 * variant and product. Scoped to one brand; the caller resolves the brand
 * from the vendor's token, never from anything the browser sends.
 */

import { fromPopup } from "./supabase/server";
import { computeLiveSettlement } from "./live-event";
import { normalizeSizeLabel } from "./sizes";
import { compareSizes } from "./selection";

export type Sale = {
  at: string;
  productTitle: string;
  size: string | null;
  colour: string | null;
  priceGbp: number;
  /** "express" is the shopper's own phone, "till" the counter. */
  source: "express" | "till";
  collectCode: string;
};

export type ProductLine = {
  productId: string;
  title: string;
  /** The colour(s) of this style, to tell two same-named products apart. */
  colour: string | null;
  imageUrl: string | null;
  unitsSold: number;
  revenueGbp: number;
  remaining: number;
  sizes: Array<{ size: string | null; sold: number; remaining: number }>;
};

export type VendorSalesReport = {
  unitsSold: number;
  grossGbp: number;
  commissionPct: number;
  commissionGbp: number;
  netPayableGbp: number;
  unitsTotal: number;
  remaining: number;
  sellThroughPct: number;
  byDay: Array<{ day: string; units: number; revenueGbp: number }>;
  byProduct: ProductLine[];
  recent: Sale[];
};

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "Europe/London" });

export async function getVendorSalesReport(brandId: string): Promise<VendorSalesReport> {
  const settlement = await computeLiveSettlement(brandId);

  // Everything the brand has on the floor, with what it is.
  const { data: products, error: pErr } = await fromPopup("popup_products")
    .select("id, title, image_url, image_urls, popup_variants(id, size, colour, popup_units(id, unit_code, status))")
    .eq("popup_brand_id", brandId)
    .eq("is_excluded", false);
  if (pErr) throw pErr;

  type UnitRow = { id: string; unit_code: string; status: string };
  type VariantRow = { id: string; size: string | null; colour: string | null; popup_units: UnitRow[] };
  const unitMeta = new Map<string, { productId: string; title: string; size: string | null; colour: string | null }>();
  const lines = new Map<string, ProductLine & { sizeMap: Map<string, { size: string | null; sold: number; remaining: number }> }>();
  let unitsTotal = 0;
  let remaining = 0;
  for (const p of products ?? []) {
    const variants = (p.popup_variants ?? []) as VariantRow[];
    const colours = [...new Set(variants.map((v) => v.colour?.trim()).filter((c): c is string => Boolean(c)))];
    const imageUrls = (p.image_urls as string[] | null) ?? [];
    const line = {
      productId: p.id as string,
      title: p.title as string,
      colour: colours.length ? colours.join(" / ") : null,
      imageUrl: imageUrls.find((u) => typeof u === "string" && u.trim()) ?? ((p.image_url as string | null)?.trim() || null),
      unitsSold: 0,
      revenueGbp: 0,
      remaining: 0,
      sizes: [],
      sizeMap: new Map(),
    };
    for (const v of variants) {
      const size = normalizeSizeLabel(v.size);
      for (const u of v.popup_units ?? []) {
        unitsTotal++;
        unitMeta.set(u.id, { productId: p.id as string, title: p.title as string, size, colour: v.colour });
        const bucket = line.sizeMap.get(size ?? "") ?? { size, sold: 0, remaining: 0 };
        if (u.status === "available") {
          bucket.remaining++;
          line.remaining++;
          remaining++;
        }
        line.sizeMap.set(size ?? "", bucket);
      }
    }
    lines.set(p.id as string, line);
  }

  // The sales themselves, with the paid time and channel from the order.
  const { data: items, error: iErr } = await fromPopup("popup_order_items")
    .select("popup_unit_id, price_gbp, created_at, popup_orders!inner(status, paid_at, source, collect_code)")
    .eq("popup_brand_id", brandId)
    .in("popup_orders.status", ["paid", "collected"])
    .order("created_at", { ascending: false });
  if (iErr) throw iErr;

  const recent: Sale[] = [];
  const byDayMap = new Map<string, { day: string; units: number; revenueGbp: number; key: string }>();
  for (const it of items ?? []) {
    const order = it.popup_orders as unknown as { paid_at: string | null; source: string | null; collect_code: string };
    const meta = unitMeta.get(it.popup_unit_id as string);
    const at = order.paid_at ?? (it.created_at as string);
    const price = Number(it.price_gbp ?? 0);
    recent.push({
      at,
      productTitle: meta?.title ?? "Item",
      size: meta?.size ?? null,
      colour: meta?.colour ?? null,
      priceGbp: price,
      source: order.source === "till" ? "till" : "express",
      collectCode: order.collect_code,
    });
    const key = at.slice(0, 10);
    const d = byDayMap.get(key) ?? { key, day: DAY.format(new Date(at)), units: 0, revenueGbp: 0 };
    d.units++;
    d.revenueGbp += price;
    byDayMap.set(key, d);
    if (meta) {
      const line = lines.get(meta.productId);
      if (line) {
        line.unitsSold++;
        line.revenueGbp += price;
        const bucket = line.sizeMap.get(meta.size ?? "") ?? { size: meta.size, sold: 0, remaining: 0 };
        bucket.sold++;
        line.sizeMap.set(meta.size ?? "", bucket);
      }
    }
  }

  const byProduct: ProductLine[] = [...lines.values()]
    .map(({ sizeMap, ...line }) => ({ ...line, sizes: [...sizeMap.values()].sort((a, b) => compareSizes(a.size, b.size)) }))
    .filter((l) => l.unitsSold > 0 || l.remaining > 0)
    .sort((a, b) => b.revenueGbp - a.revenueGbp || b.unitsSold - a.unitsSold || a.title.localeCompare(b.title));

  return {
    unitsSold: settlement.unitsSold,
    grossGbp: settlement.grossGbp,
    commissionPct: settlement.commissionPct,
    commissionGbp: settlement.commissionGbp,
    netPayableGbp: settlement.netPayableGbp,
    unitsTotal,
    remaining,
    sellThroughPct: unitsTotal === 0 ? 0 : Math.round((settlement.unitsSold / unitsTotal) * 100),
    byDay: [...byDayMap.values()].sort((a, b) => a.key.localeCompare(b.key)).map(({ key: _k, ...d }) => d),
    byProduct,
    recent,
  };
}

/** One row per garment sold, for the brand's own records. */
export function salesCsv(brandName: string, sales: Sale[]): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["Brand", "Sold at (London)", "Product", "Size", "Colour", "Price (GBP)", "Channel", "Order"]];
  const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/London" });
  for (const s of [...sales].reverse()) {
    rows.push([brandName, fmt.format(new Date(s.at)), s.productTitle, s.size ?? "", s.colour ?? "", s.priceGbp.toFixed(2), s.source === "till" ? "Counter" : "Online", s.collectCode]);
  }
  return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
