import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/chrome";
import Link from "next/link";
import { PhotoPlaceholder } from "@/components/store/photo-placeholder";
import { CopyCode } from "@/components/admin/copy-code";
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
  { value: "fitting_room", label: "Fitting room" },
  { value: "sold", label: "Sold" },
];
// Same dots as Item lookup, so a piece reads the same on both screens.
const DOT: Record<UnitStatus, string> = {
  available: "bg-green-500",
  held: "bg-amber-500",
  fitting_room: "bg-blue-500",
  sold: "bg-neutral-400",
};

/** The four status buttons for one piece: current one filled, the rest outlined. */
function StatusButtons({ unitId, eventId, unitCode, status, productId }: { unitId: string; eventId: string; unitCode: string; status: UnitStatus; productId?: string }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {STATUS_BUTTONS.map((btn) => {
        const current = status === btn.value;
        return (
          <form key={btn.value} action={setUnitStatusAction}>
            <input type="hidden" name="unit_id" value={unitId} />
            <input type="hidden" name="event_id" value={eventId} />
            <input type="hidden" name="unit_code" value={unitCode} />
            {productId && <input type="hidden" name="product_id" value={productId} />}
            <input type="hidden" name="to_status" value={btn.value} />
            <input type="hidden" name="changed_by" value="floor-staff" />
            <button
              type="submit"
              disabled={current}
              aria-pressed={current}
              className={`w-full px-2 py-2 text-[11px] uppercase tracking-[0.15em] ${
                current ? "bg-neutral-900 text-white" : "border border-neutral-900 text-neutral-900 hover:bg-neutral-50"
              }`}
            >
              {btn.label}
            </button>
          </form>
        );
      })}
    </div>
  );
}

function StyleHeader({ imageUrl, brandName, title, sub }: { imageUrl: string | null; brandName: string; title: string; sub: string }) {
  return (
    <div className="flex gap-4">
      <div className="relative h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-gray-200">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <PhotoPlaceholder />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs uppercase tracking-widest text-gray-400">{brandName}</p>
        <h2 className="mt-1 text-sm text-gray-900">{title}</h2>
        <p className="mt-1 text-[11px] text-neutral-500">{sub}</p>
      </div>
    </div>
  );
}

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
          <StyleHeader
            imageUrl={product.imageUrl}
            brandName={product.brandName}
            title={product.productTitle}
            sub={`${product.units.length} piece${product.units.length === 1 ? "" : "s"}. Tap a code to copy it, or a status to change that piece.`}
          />

          <ul className="mt-6 divide-y divide-neutral-100 border-y border-neutral-100 text-xs">
            {product.units.length === 0 && <li className="py-4 text-neutral-500">No tags for this style yet.</li>}
            {product.units.map((u) => (
              <li key={u.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-900">
                    {u.size ?? "One size"}
                    {u.colour && <span className="text-neutral-400"> · {u.colour}</span>}
                  </span>
                  <CopyCode
                    code={u.unitCode}
                    className={`${u.status === "available" ? "text-neutral-900" : "text-neutral-400 line-through"} ${updated === u.unitCode ? "bg-yellow-100" : "hover:bg-neutral-100"}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${DOT[u.status]}`} />
                    {u.unitCode}
                  </CopyCode>
                </div>
                <StatusButtons unitId={u.id} eventId={product.eventId} unitCode={u.unitCode} status={u.status} productId={product.productId} />
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
        <div className="max-w-xl">
          <Link href="/admin/items" className="mb-4 inline-block text-[11px] uppercase tracking-[0.2em] text-neutral-500 underline underline-offset-4 hover:text-neutral-900">
            ← All items
          </Link>
          <StyleHeader imageUrl={unit.imageUrl} brandName={unit.brandName} title={unit.productTitle} sub="One piece. Tap the code to copy it, or its new status." />
          <ul className="mt-6 divide-y divide-neutral-100 border-y border-neutral-100 text-xs">
            <li className="py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-900">
                  {unit.size ?? "One size"}
                  {unit.colour && <span className="text-neutral-400"> · {unit.colour}</span>}
                  {unit.location && <span className="text-neutral-400"> · {unit.location}</span>}
                </span>
                <CopyCode code={unit.unitCode} className="text-neutral-900 hover:bg-neutral-100">
                  <span className={`h-1.5 w-1.5 rounded-full ${DOT[unit.status]}`} />
                  {unit.unitCode}
                </CopyCode>
              </div>
              <StatusButtons unitId={unit.id} eventId={event.id} unitCode={unit.unitCode} status={unit.status} />
            </li>
          </ul>
        </div>
      )}

    </AdminShell>
  );
}
