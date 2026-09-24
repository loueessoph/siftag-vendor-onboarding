import type { Metadata } from "next";
import { AdminShell, Empty } from "@/components/admin/chrome";
import { Button, Muted } from "@/components/ui";
import {
  getActiveEvent,
  getSalesByBrand,
  getStockByBrand,
  listSettlements,
  money,
  releaseExpiredHolds,
} from "@/lib/live-event";
import { generateSettlementAction } from "./actions";

export const metadata: Metadata = {
  title: "Dashboard: Siftag pop-up admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The organiser's live view: stock by brand, then sales + a settlement
 * they can generate as a draft (regenerate any time) or finalize once
 * (locked after — see generateSettlement in lib/live-event.ts).
 */
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; error?: string }>;
}) {
  const { updated, error } = await searchParams;
  const event = await getActiveEvent();
  await releaseExpiredHolds(event.id);

  const [stock, sales, settlements] = await Promise.all([
    getStockByBrand(),
    getSalesByBrand(),
    listSettlements(event.id),
  ]);

  const settlementByBrand = new Map(
    settlements.map((s) => [s.popup_brand_id as string, s])
  );

  return (
    <AdminShell eyebrow="Event day" title="Live dashboard">
      {updated && (
        <div className="mb-6 border border-neutral-900 px-4 py-3 text-sm">Updated.</div>
      )}
      {error && (
        <div className="mb-6 border border-red-600 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <h2 className="mb-3 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
        Stock by brand
      </h2>
      {stock.length === 0 ? (
        <Empty>No units tagged yet — nothing's been received against a declared quantity.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-y border-neutral-200 text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                <th className="py-3">Brand</th>
                <th className="py-3 text-right">Total</th>
                <th className="py-3 text-right">Available</th>
                <th className="py-3 text-right">Held</th>
                <th className="py-3 text-right">Fitting room</th>
                <th className="py-3 text-right">Sold</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {stock.map((row) => (
                <tr key={row.popup_brand_id}>
                  <td className="py-3 font-medium">{row.brand_name}</td>
                  <td className="py-3 text-right">{row.total_units}</td>
                  <td className="py-3 text-right">{row.available_units}</td>
                  <td className="py-3 text-right">{row.held_units}</td>
                  <td className="py-3 text-right">{row.fitting_room_units}</td>
                  <td className="py-3 text-right text-neutral-500">{row.sold_units}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 mt-12 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
        Sales &amp; settlement by brand
      </h2>
      {sales.length === 0 ? (
        <Empty>No sales recorded yet.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-y border-neutral-200 text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                <th className="py-3">Brand</th>
                <th className="py-3 text-right">Units sold</th>
                <th className="py-3 text-right">Gross</th>
                <th className="py-3 text-right">Settlement</th>
                <th className="py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {sales.map((row) => {
                const settlement = settlementByBrand.get(row.popup_brand_id);
                const isFinal = settlement?.status === "final";
                return (
                  <tr key={row.popup_brand_id}>
                    <td className="py-3 font-medium">{row.brand_name}</td>
                    <td className="py-3 text-right">{row.units_sold}</td>
                    <td className="py-3 text-right">{money(row.gross_gbp)}</td>
                    <td className="py-3 text-right">
                      {settlement ? (
                        <span className={isFinal ? "font-medium" : "text-neutral-500"}>
                          {money(settlement.net_payable_gbp)} ({settlement.status})
                        </span>
                      ) : (
                        <Muted>—</Muted>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <form action={generateSettlementAction}>
                          <input type="hidden" name="popup_brand_id" value={row.popup_brand_id} />
                          <input type="hidden" name="finalize" value="false" />
                          <Button type="submit" size="compact" variant="secondary" disabled={isFinal}>
                            Draft
                          </Button>
                        </form>
                        <form action={generateSettlementAction}>
                          <input type="hidden" name="popup_brand_id" value={row.popup_brand_id} />
                          <input type="hidden" name="finalize" value="true" />
                          <Button type="submit" size="compact" disabled={isFinal}>
                            Finalize
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-neutral-400">
            Draft can be regenerated any time before finalizing; a finalized settlement is locked.
          </p>
        </div>
      )}
    </AdminShell>
  );
}
