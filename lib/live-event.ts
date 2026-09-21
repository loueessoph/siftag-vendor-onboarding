/**
 * The event-day layer: one physical unit per garment (so a printed tag maps
 * to exactly one row), a hold/status state machine (available -> held /
 * fitting_room -> sold), and the numbers an organiser or a vendor actually
 * wants — stock by brand, sales by brand, and a per-brand settlement.
 *
 * Ported from the Siftag-Popup branch of the main siftag repo, where the
 * customer-facing browse/tag/express-checkout pages already live. This app
 * doesn't grow a storefront of its own here — it's the admin side (organiser
 * dashboard + floor-staff console) and the vendor's own sales view, both
 * reading the same shared popup_ tables that repo writes to.
 */

import { fromPopup, supabaseAdmin } from "./supabase/server";
import { money } from "./format";

export type UnitStatus = "available" | "held" | "fitting_room" | "sold";

const UNIT_STATUSES: UnitStatus[] = ["available", "held", "fitting_room", "sold"];

export function isUnitStatus(value: string): value is UnitStatus {
  return (UNIT_STATUSES as string[]).includes(value);
}

/** The single pop-up event row. One row is expected to exist; seeded by the live-event migration. */
export async function getActiveEvent() {
  const { data, error } = await fromPopup("popup_events")
    .select("id, name, status, reserve_hold_minutes, express_hold_minutes")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No popup_events row exists yet.");
  return data as {
    id: string;
    name: string;
    status: "draft" | "live" | "closed";
    reserve_hold_minutes: number;
    express_hold_minutes: number;
  };
}

/**
 * Releases any hold past its expiry: its units go back to 'available' and
 * the hold is marked 'expired'. Called at the top of every read/write path
 * that touches units, rather than a separate cron worker.
 */
export async function releaseExpiredHolds(eventId: string): Promise<void> {
  const db = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: expired, error } = await fromPopup("popup_holds")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "active")
    .lt("expires_at", nowIso);
  if (error) throw error;
  if (!expired || expired.length === 0) return;

  const holdIds = expired.map((h) => h.id as string);
  const { data: units, error: unitsError } = await fromPopup("popup_units")
    .select("id, status")
    .in("hold_id", holdIds);
  if (unitsError) throw unitsError;

  for (const unit of units ?? []) {
    if (unit.status === "sold") continue;
    await db
      .from("popup_units")
      .update({ status: "available", hold_id: null, updated_at: nowIso })
      .eq("id", unit.id);
    await db.from("popup_unit_events").insert({
      popup_unit_id: unit.id,
      event_id: eventId,
      from_status: unit.status,
      to_status: "available",
      changed_by: "system",
      note: "hold expired",
    });
  }

  await fromPopup("popup_holds")
    .update({ status: "expired", released_at: nowIso })
    .in("id", holdIds);
}

export type StaffUnit = {
  id: string;
  eventId: string;
  unitCode: string;
  status: UnitStatus;
  location: string | null;
  size: string | null;
  colour: string | null;
  sku: string | null;
  productTitle: string;
  imageUrl: string | null;
  brandName: string;
};

/** Compact unit lookup for the floor-staff console — enough to confirm it's the right item before tapping a status. */
export async function getUnitForStaff(unitCode: string): Promise<StaffUnit | null> {
  const { data: unit, error: unitError } = await fromPopup("popup_units")
    .select("id, event_id, status, location, popup_variant_id")
    .eq("unit_code", unitCode.toUpperCase())
    .maybeSingle();
  if (unitError) throw unitError;
  if (!unit) return null;

  await releaseExpiredHolds(unit.event_id);
  const { data: fresh } = await fromPopup("popup_units")
    .select("status")
    .eq("id", unit.id)
    .single();

  const { data: variant, error: variantError } = await fromPopup("popup_variants")
    .select("size, colour, sku, popup_product_id")
    .eq("id", unit.popup_variant_id)
    .single();
  if (variantError) throw variantError;

  const { data: product, error: productError } = await fromPopup("popup_products")
    .select("title, image_url, popup_brand_id")
    .eq("id", variant.popup_product_id)
    .single();
  if (productError) throw productError;

  const { data: brand, error: brandError } = await fromPopup("popup_brands")
    .select("name")
    .eq("id", product.popup_brand_id)
    .single();
  if (brandError) throw brandError;

  return {
    id: unit.id as string,
    eventId: unit.event_id as string,
    unitCode: unitCode.toUpperCase(),
    status: (fresh?.status ?? unit.status) as UnitStatus,
    location: unit.location as string | null,
    size: variant.size as string | null,
    colour: variant.colour as string | null,
    sku: variant.sku as string | null,
    productTitle: product.title as string,
    imageUrl: product.image_url as string | null,
    brandName: brand.name as string,
  };
}

/**
 * Staff-driven two-tap status change: pick the item, tap the new status.
 * Moving into held/fitting_room opens a fresh hold; moving to
 * available/sold closes out whatever hold was open.
 */
export async function setUnitStatus(params: {
  unitId: string;
  eventId: string;
  toStatus: UnitStatus;
  changedBy: string;
  holdMinutes?: number;
}): Promise<{ previousStatus: UnitStatus }> {
  const db = supabaseAdmin();
  const { unitId, eventId, toStatus, changedBy } = params;

  const { data: unit, error: unitError } = await fromPopup("popup_units")
    .select("id, status, hold_id")
    .eq("id", unitId)
    .single();
  if (unitError) throw unitError;

  const nowIso = new Date().toISOString();
  let newHoldId: string | null = unit.hold_id;

  if (toStatus === "held" || toStatus === "fitting_room") {
    const holdType = toStatus === "fitting_room" ? "fitting_room" : "reserve_line";
    const minutes = params.holdMinutes ?? (toStatus === "fitting_room" ? 20 : 30);
    const { data: hold, error: holdError } = await db
      .from("popup_holds")
      .insert({
        event_id: eventId,
        hold_type: holdType,
        status: "active",
        expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (holdError) throw holdError;
    newHoldId = hold.id;
  } else {
    newHoldId = null;
    if (unit.hold_id) {
      await db
        .from("popup_holds")
        .update({ status: "released", released_at: nowIso })
        .eq("id", unit.hold_id)
        .eq("status", "active");
    }
  }

  const { error: updateError } = await db
    .from("popup_units")
    .update({ status: toStatus, hold_id: newHoldId, updated_at: nowIso })
    .eq("id", unitId);
  if (updateError) throw updateError;

  await db.from("popup_unit_events").insert({
    popup_unit_id: unitId,
    event_id: eventId,
    from_status: unit.status,
    to_status: toStatus,
    changed_by: changedBy,
  });

  return { previousStatus: unit.status as UnitStatus };
}

export type StockByBrand = {
  popup_brand_id: string;
  brand_name: string;
  total_units: number;
  available_units: number;
  held_units: number;
  fitting_room_units: number;
  sold_units: number;
};

export async function getStockByBrand(): Promise<StockByBrand[]> {
  const { data, error } = await fromPopup("popup_stock_by_brand")
    .select("*")
    .order("brand_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StockByBrand[];
}

export type SalesByBrand = {
  popup_brand_id: string;
  brand_name: string;
  units_sold: number;
  gross_gbp: number;
};

export async function getSalesByBrand(): Promise<SalesByBrand[]> {
  const { data, error } = await fromPopup("popup_sales_by_brand")
    .select("*")
    .order("brand_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SalesByBrand[];
}

export async function getRecentActivity(eventId: string, limit = 30) {
  const { data, error } = await fromPopup("popup_unit_events")
    .select("to_status, from_status, changed_by, created_at, popup_units(unit_code)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export type LiveSettlement = {
  popupBrandId: string;
  brandName: string;
  unitsSold: number;
  grossGbp: number;
  commissionPct: number;
  commissionGbp: number;
  netPayableGbp: number;
};

/** Live (not-yet-finalized) settlement figures for one brand — its own current commission rate against its own sales. */
export async function computeLiveSettlement(popupBrandId: string): Promise<LiveSettlement> {
  const { data: brand, error: brandError } = await fromPopup("popup_brands")
    .select("id, name, commission_pct")
    .eq("id", popupBrandId)
    .single();
  if (brandError) throw brandError;

  const { data: sales, error: salesError } = await fromPopup("popup_sales_by_brand")
    .select("*")
    .eq("popup_brand_id", popupBrandId)
    .maybeSingle();
  if (salesError) throw salesError;

  const grossGbp = Number(sales?.gross_gbp ?? 0);
  const unitsSold = Number(sales?.units_sold ?? 0);
  const commissionPct = Number(brand.commission_pct ?? 0);
  const commissionGbp = Math.round(grossGbp * (commissionPct / 100) * 100) / 100;
  const netPayableGbp = Math.round((grossGbp - commissionGbp) * 100) / 100;

  return {
    popupBrandId,
    brandName: brand.name as string,
    unitsSold,
    grossGbp,
    commissionPct,
    commissionGbp,
    netPayableGbp,
  };
}

export type VendorSales = LiveSettlement & {
  stock: { available: number; held: number; fittingRoom: number; sold: number; total: number };
};

/**
 * The figures shown on a vendor's own hub: units sold, revenue, their actual
 * commission rate, an estimated payout, and live stock. Scoped strictly to
 * the one brand passed in — callers must resolve the brand from the
 * vendor's own access_token first (see getVendorByToken in lib/vendor.ts),
 * never from anything the browser sends.
 */
export async function getVendorSales(popupBrandId: string): Promise<VendorSales> {
  const settlement = await computeLiveSettlement(popupBrandId);

  const { data: stockRow, error: stockError } = await fromPopup("popup_stock_by_brand")
    .select("available_units, held_units, fitting_room_units, sold_units, total_units")
    .eq("popup_brand_id", popupBrandId)
    .maybeSingle();
  if (stockError) throw stockError;

  return {
    ...settlement,
    stock: {
      available: stockRow?.available_units ?? 0,
      held: stockRow?.held_units ?? 0,
      fittingRoom: stockRow?.fitting_room_units ?? 0,
      sold: stockRow?.sold_units ?? 0,
      total: stockRow?.total_units ?? 0,
    },
  };
}

/** Generates (or re-generates, while draft) a settlement snapshot row for one brand after the event closes. */
export async function generateSettlement(params: {
  eventId: string;
  popupBrandId: string;
  finalize: boolean;
  generatedBy: string;
}) {
  const db = supabaseAdmin();
  const live = await computeLiveSettlement(params.popupBrandId);

  const { data: existingFinal } = await fromPopup("popup_settlements")
    .select("id")
    .eq("event_id", params.eventId)
    .eq("popup_brand_id", params.popupBrandId)
    .eq("status", "final")
    .maybeSingle();
  if (existingFinal && params.finalize) {
    throw new Error("This brand's settlement is already finalized.");
  }

  // Replace any existing draft for this brand+event rather than accumulating duplicates.
  await db
    .from("popup_settlements")
    .delete()
    .eq("event_id", params.eventId)
    .eq("popup_brand_id", params.popupBrandId)
    .eq("status", "draft");

  const { data: settlement, error } = await db
    .from("popup_settlements")
    .insert({
      event_id: params.eventId,
      popup_brand_id: params.popupBrandId,
      units_sold: live.unitsSold,
      gross_gbp: live.grossGbp,
      commission_pct: live.commissionPct,
      commission_gbp: live.commissionGbp,
      net_payable_gbp: live.netPayableGbp,
      status: params.finalize ? "final" : "draft",
      generated_by: params.generatedBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return settlement;
}

export async function listSettlements(eventId: string) {
  const { data, error } = await fromPopup("popup_settlements")
    .select("*, popup_brands(name)")
    .eq("event_id", eventId)
    .order("generated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export { money };
