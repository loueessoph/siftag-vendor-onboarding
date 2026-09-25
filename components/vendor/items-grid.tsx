import Image from "next/image";
import type { AdminItem } from "@/lib/admin-items";
import type { UnitStatus } from "@/lib/live-event";
import { sized } from "@/lib/images";
import { PhotoPlaceholder } from "@/components/store/photo-placeholder";

const STATUS: Record<UnitStatus, { label: string; dot: string }> = {
  available: { label: "Available", dot: "bg-green-500" },
  held: { label: "Held", dot: "bg-amber-500" },
  fitting_room: { label: "In the fitting room", dot: "bg-blue-500" },
  sold: { label: "Sold", dot: "bg-neutral-400" },
};

const money = (n: number | null) => (n == null ? "—" : `£${n.toFixed(2)}`);

/**
 * A brand's own pieces, laid out like the staff Item lookup: photo, name,
 * price, then every size with its tag codes and live status. Read only.
 * Server-rendered, so it is exactly what the floor sees at the moment the
 * page loads; a refresh brings the latest.
 */
export function VendorItemsGrid({ items }: { items: AdminItem[] }) {
  if (items.length === 0) {
    return (
      <div className="border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-neutral-500">
        No pieces on the floor yet. Items appear here once they have been tagged.
      </div>
    );
  }
  return (
    <>
      <p className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500">
        {(Object.keys(STATUS) as UnitStatus[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS[k].dot}`} />
            {STATUS[k].label}
          </span>
        ))}
      </p>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        {items.map((item) => (
          <article key={item.productId} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 sm:flex sm:flex-col">
            <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-gray-200 sm:mb-3">
              {item.imageUrl ? (
                <Image src={sized(item.imageUrl, 600)} alt={item.title} fill sizes="(max-width: 640px) 30vw, (max-width: 1024px) 50vw, 33vw" className="object-cover object-top" />
              ) : (
                <PhotoPlaceholder />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm text-gray-900">{item.title}</h3>
              {item.fibreComposition && <p className="mt-1 truncate text-xs text-gray-500">{item.fibreComposition}</p>}
              <p className="mt-1 text-sm text-gray-900">{money(item.priceGbp)}</p>
              <p className="mt-3 text-[11px] text-neutral-500">
                <span className="text-neutral-900">{item.counts.available} available</span>
                {item.counts.held > 0 && ` · ${item.counts.held} held`}
                {item.counts.fitting_room > 0 && ` · ${item.counts.fitting_room} in fitting room`}
                {item.counts.sold > 0 && ` · ${item.counts.sold} sold`}
                {item.counts.available + item.counts.held + item.counts.fitting_room + item.counts.sold === 0 && "Not tagged yet"}
              </p>
            </div>
            <ul className="col-span-2 mt-3 divide-y divide-neutral-100 border-y border-neutral-100 text-xs sm:mt-2">
              {item.sizes.map((s) => (
                <li key={`${s.size}-${s.colour}-${s.sku}`} className="flex items-start justify-between gap-3 py-1.5">
                  <span className="shrink-0 text-neutral-900">
                    {s.size ?? "One size"}
                    {s.colour && <span className="text-neutral-400"> · {s.colour}</span>}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap justify-end gap-x-2 gap-y-0.5">
                    {s.units.length === 0 && <span className="text-neutral-300">no tags</span>}
                    {s.units.map((u) => (
                      <span
                        key={u.code}
                        title={STATUS[u.status].label}
                        className={`inline-flex items-center gap-1 font-mono ${u.status === "available" ? "text-neutral-900" : "text-neutral-400 line-through"}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS[u.status].dot}`} />
                        {u.code}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </>
  );
}
