import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/chrome";
import Link from "next/link";
import { Button, Muted, Pill } from "@/components/ui";
import { getActiveEvent, getProductUnitsForStaff, getUnitForStaff, type UnitStatus } from "@/lib/live-event";
import { fromPopup } from "@/lib/supabase/server";
import { setUnitStatusAction } from "./actions";
import { Briefing, brandsForBrief } from "./briefing";

export const metadata: Metadata = {
  title: "Floor staff briefing: Siftag pop-up admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_BUTTONS: { value: UnitStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "held", label: "Held" },
  { value: "fitting_room", label: "Fitting Room" },
  { value: "sold", label: "Sold" },
];

/**
 * The floor staff page. Without a code it is the day brief: hours, how the
 * floor works, customer FAQ, how the till and pickup counter work, and a
 * line on every brand. With ?code= (linked from Item lookup) it is tap two
 * of the two-tap status flow: the piece is shown with buttons for its new
 * status. Plain forms throughout, so it works on any phone without JS.
 */
export default async function StaffConsole({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    product?: string;
    updated?: string;
    error?: string;
  }>;
}) {
  const { code, product: productId, updated, error } = await searchParams;
  const event = await getActiveEvent();
  const unit = code ? await getUnitForStaff(code) : null;
  const product = !code && productId ? await getProductUnitsForStaff(productId) : null;
  const focused = Boolean(code || productId);
  const { data: brandRows } = focused
    ? { data: [] }
    : await fromPopup("popup_brands").select("name, slug, attending_days");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

  return (
    <AdminShell eyebrow="Event day" title={focused ? "Change an item's status" : "Floor staff briefing"}>
      {updated && (
        <div className="mb-6 border border-neutral-900 px-4 py-3 text-sm">
          Updated{updated !== "1" ? ` ${updated}` : ""}.
        </div>
      )}
      {error && (
        <div className="mb-6 border border-red-600 px-4 py-3 text-sm text-red-600">
          Couldn&apos;t update that item — try scanning it again.
        </div>
      )}

      {productId && !product && <p className="text-sm text-red-600">No item with that id.</p>}

      {product && (
        <div className="max-w-xl">
          <Link href="/admin/items" className="mb-4 inline-block text-[11px] uppercase tracking-[0.2em] text-neutral-500 underline underline-offset-4 hover:text-neutral-900">
            ← All items
          </Link>
          <div className="flex gap-4">
            {product.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt="" className="h-24 w-20 object-cover object-top" />
            )}
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">{product.brandName}</p>
              <p className="mt-1 font-medium">{product.productTitle}</p>
              <Muted>
                {product.units.length} piece{product.units.length === 1 ? "" : "s"}. Tap a status to change that piece.
              </Muted>
            </div>
          </div>

          <ul className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200">
            {product.units.length === 0 && <li className="py-4 text-sm text-neutral-500">No tags for this style yet.</li>}
            {product.units.map((u) => (
              <li key={u.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <p className="text-sm">
                    <span className="font-medium">{u.size ?? "One size"}</span>
                    {u.colour && <span className="text-neutral-500"> · {u.colour}</span>}
                    <span className="ml-3 font-mono text-xs text-neutral-500">{u.unitCode}</span>
                  </p>
                  <Pill tone={u.status === "sold" ? "done" : "neutral"}>{u.status.replace("_", " ")}</Pill>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {STATUS_BUTTONS.map((btn) => (
                    <form key={btn.value} action={setUnitStatusAction}>
                      <input type="hidden" name="unit_id" value={u.id} />
                      <input type="hidden" name="event_id" value={product.eventId} />
                      <input type="hidden" name="unit_code" value={u.unitCode} />
                      <input type="hidden" name="product_id" value={product.productId} />
                      <input type="hidden" name="to_status" value={btn.value} />
                      <input type="hidden" name="changed_by" value="floor-staff" />
                      <Button type="submit" full size="small" variant={u.status === btn.value ? "secondary" : "primary"} disabled={u.status === btn.value}>
                        {btn.label}
                      </Button>
                    </form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!focused && (
        <Briefing
          brands={brandsForBrief((brandRows ?? []) as Array<{ name: string; slug: string; attending_days: string[] | null }>)}
          today={today}
        />
      )}

      {code && !unit && (
        <p className="text-sm text-red-600">No item with that code.</p>
      )}

      {unit && (
        <div className="max-w-sm border border-neutral-200 p-5">
          <Link href="/admin/items" className="mb-4 inline-block text-[11px] uppercase tracking-[0.2em] text-neutral-500 underline underline-offset-4 hover:text-neutral-900">
            ← All items
          </Link>
          <div className="flex gap-4">
            {unit.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={unit.imageUrl} alt="" className="h-20 w-20 object-cover" />
            )}
            <div>
              <p className="font-medium">{unit.productTitle}</p>
              <Muted>
                {unit.brandName} · {unit.size ?? "—"}
                {unit.colour ? ` · ${unit.colour}` : ""}
              </Muted>
              <p className="mt-1 text-xs text-neutral-400">
                {unit.unitCode}
                {unit.location ? ` · ${unit.location}` : ""}
              </p>
              <div className="mt-2">
                <Pill tone={unit.status === "sold" ? "done" : "neutral"}>
                  {unit.status.replace("_", " ")}
                </Pill>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            {STATUS_BUTTONS.map((btn) => (
              <form key={btn.value} action={setUnitStatusAction}>
                <input type="hidden" name="unit_id" value={unit.id} />
                <input type="hidden" name="event_id" value={event.id} />
                <input type="hidden" name="unit_code" value={unit.unitCode} />
                <input type="hidden" name="to_status" value={btn.value} />
                <input type="hidden" name="changed_by" value="floor-staff" />
                <Button
                  type="submit"
                  full
                  variant={unit.status === btn.value ? "secondary" : "primary"}
                  disabled={unit.status === btn.value}
                >
                  {btn.label}
                </Button>
              </form>
            ))}
          </div>
        </div>
      )}

    </AdminShell>
  );
}
