import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/chrome";
import Link from "next/link";
import { Button, Muted, Pill } from "@/components/ui";
import { getActiveEvent, getUnitForStaff, type UnitStatus } from "@/lib/live-event";
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
    updated?: string;
    error?: string;
    collected?: string;
    collect_error?: string;
  }>;
}) {
  const { code, updated, error } = await searchParams;
  const event = await getActiveEvent();
  const unit = code ? await getUnitForStaff(code) : null;
  const { data: brandRows } = code
    ? { data: [] }
    : await fromPopup("popup_brands").select("name, slug, attending_days");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

  return (
    <AdminShell eyebrow="Event day" title={code ? "Change an item's status" : "Floor staff briefing"}>
      {updated && (
        <div className="mb-6 border border-neutral-900 px-4 py-3 text-sm">Updated.</div>
      )}
      {error && (
        <div className="mb-6 border border-red-600 px-4 py-3 text-sm text-red-600">
          Couldn&apos;t update that item — try scanning it again.
        </div>
      )}

      {!code && (
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
