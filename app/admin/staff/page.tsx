import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/chrome";
import Link from "next/link";
import { Button, Input, Muted, Pill } from "@/components/ui";
import { getActiveEvent, getUnitForStaff, type UnitStatus } from "@/lib/live-event";
import { setUnitStatusAction, collectOrderAction } from "./actions";

export const metadata: Metadata = {
  title: "Floor staff: Siftag pop-up admin",
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
 * Tap two of the two-tap flow: the piece was found on the Items page (tap
 * one, which links here with its code); now tap the new status. Plain forms
 * throughout — this is meant to run on a shared iPad at the till, where
 * "does it need JS to work" is not a safe bet.
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
  const { code, updated, error, collected, collect_error: collectError } = await searchParams;
  const event = await getActiveEvent();
  const unit = code ? await getUnitForStaff(code) : null;

  return (
    <AdminShell eyebrow="Event day" title="Floor staff">
      {updated && (
        <div className="mb-6 border border-neutral-900 px-4 py-3 text-sm">Updated.</div>
      )}
      {error && (
        <div className="mb-6 border border-red-600 px-4 py-3 text-sm text-red-600">
          Couldn&apos;t update that item — try scanning it again.
        </div>
      )}

      {!code && (
        <div className="max-w-sm">
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Change an item&apos;s status</p>
          <div className="mt-1">
            <Muted>
              Find the piece on the{" "}
              <Link href="/admin/items" className="underline underline-offset-4 hover:text-neutral-900">
                Items
              </Link>{" "}
              page, by name, brand or the code under its QR, and tap the code to mark it held, in the fitting room, sold or back on the rail.
            </Muted>
          </div>
        </div>
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

      <div className="mt-16 max-w-sm border-t border-neutral-200 pt-8">
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Express counter</p>
        <div className="mt-1">
          <Muted>A customer who paid online — type or scan their collect code.</Muted>
        </div>

        {collected && (
          <div className="mt-4 border border-neutral-900 px-4 py-3 text-sm">Collected: {collected}</div>
        )}
        {collectError && (
          <div className="mt-4 border border-red-600 px-4 py-3 text-sm text-red-600">{collectError}</div>
        )}

        <form action={collectOrderAction} className="mt-4">
          <div className="flex gap-2">
            <Input name="collect_code" placeholder="Collect code" className="uppercase" />
            <Button type="submit" size="compact">
              Mark collected
            </Button>
          </div>
        </form>
      </div>
    </AdminShell>
  );
}
