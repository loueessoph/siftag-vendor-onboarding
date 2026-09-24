"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { AdminItem } from "@/lib/admin-items";
import type { UnitStatus } from "@/lib/live-event";
import { sized } from "@/lib/images";
import { PhotoPlaceholder } from "@/components/store/photo-placeholder";

const STATUS: Record<UnitStatus, { label: string; dot: string }> = {
  available: { label: "Available", dot: "bg-green-500" },
  held: { label: "Held", dot: "bg-amber-500" },
  fitting_room: { label: "Fitting room", dot: "bg-blue-500" },
  sold: { label: "Sold", dot: "bg-neutral-400" },
};

const money = (n: number | null) => (n == null ? "—" : `£${n.toFixed(2)}`);

/**
 * The storefront's card grid, for staff: each card carries its stock by
 * size and every tag code with its status. Type part of a name, a brand or
 * a tag code to find something; the code under a garment's QR is the
 * quickest way to a specific piece.
 */
export function ItemsClient({ items }: { items: AdminItem[] }) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const brands = useMemo(() => [...new Set(items.map((i) => i.brandName))].sort(), [items]);

  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => {
    if (brand !== "all" && i.brandName !== brand) return false;
    if (onlyInStock && i.counts.available === 0) return false;
    if (!q) return true;
    if (i.title.toLowerCase().includes(q) || i.brandName.toLowerCase().includes(q)) return true;
    return i.sizes.some((s) => s.units.some((u) => u.code.toLowerCase().includes(q)) || (s.sku ?? "").toLowerCase().includes(q));
  });
  const codeMatch = q.length >= 4 ? q.toUpperCase() : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 pb-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, brand, tag code or till SKU"
          autoFocus
          className="w-full rounded-full border border-neutral-300 px-4 py-2.5 text-sm focus:border-neutral-900 focus:outline-none sm:max-w-md"
        />
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          <input type="checkbox" checked={onlyInStock} onChange={(e) => setOnlyInStock(e.target.checked)} className="h-4 w-4 accent-black" />
          In stock only
        </label>
        <span className="ml-auto text-xs text-neutral-500">{shown.length} of {items.length}</span>
      </div>

      <div className="scrollbar-hide -mx-6 flex gap-1.5 overflow-x-auto px-6 py-3">
        {["all", ...brands].map((b) => (
          <button
            key={b}
            onClick={() => setBrand(b)}
            className={`shrink-0 rounded-full border px-3 py-1 text-[11px] uppercase tracking-wide ${brand === b ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-500"}`}
          >
            {b === "all" ? "All brands" : b}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6 pt-4 md:grid-cols-3 lg:grid-cols-4">
        {shown.map((item) => (
          <article key={item.productId} className="flex flex-col">
            <Link href={`/popup/product/${item.productId}`} target="_blank" className="relative mb-3 aspect-[3/4] overflow-hidden rounded-lg bg-gray-200">
              {item.imageUrl ? (
                <Image src={sized(item.imageUrl, 600)} alt={item.title} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover object-top" />
              ) : (
                <PhotoPlaceholder />
              )}
            </Link>
            <p className="mb-1 truncate text-xs uppercase tracking-widest text-gray-400">{item.brandName}</p>
            <h3 className="mb-1 text-sm text-gray-900">{item.title}</h3>
            {item.fibreComposition && <p className="mb-1 truncate text-xs text-gray-500">{item.fibreComposition}</p>}
            <p className="text-sm text-gray-900">{money(item.priceGbp)}</p>

            <p className="mt-3 text-[11px] text-neutral-500">
              <span className="text-neutral-900">{item.counts.available} available</span>
              {item.counts.held > 0 && ` · ${item.counts.held} held`}
              {item.counts.fitting_room > 0 && ` · ${item.counts.fitting_room} in fitting room`}
              {item.counts.sold > 0 && ` · ${item.counts.sold} sold`}
              {item.counts.available + item.counts.held + item.counts.fitting_room + item.counts.sold === 0 && "No stock declared"}
            </p>

            <ul className="mt-2 divide-y divide-neutral-100 border-y border-neutral-100 text-xs">
              {item.sizes.map((s) => (
                <li key={`${s.size}-${s.colour}-${s.sku}`} className="flex items-start justify-between gap-3 py-1.5">
                  <span className="shrink-0 text-neutral-900">
                    {s.size ?? "One size"}
                    {s.colour && <span className="text-neutral-400"> · {s.colour}</span>}
                  </span>
                  <span className="flex flex-wrap justify-end gap-x-2 gap-y-0.5">
                    {s.units.length === 0 && <span className="text-neutral-300">no tags</span>}
                    {s.units.map((u) => (
                      <span
                        key={u.code}
                        title={STATUS[u.status].label}
                        className={`inline-flex items-center gap-1 font-mono ${u.status === "available" ? "text-neutral-900" : "text-neutral-400 line-through"} ${codeMatch && u.code === codeMatch ? "rounded bg-yellow-100 px-1 no-underline" : ""}`}
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
        {shown.length === 0 && <p className="col-span-full py-10 text-center text-sm text-neutral-400">Nothing matches.</p>}
      </div>
    </div>
  );
}
