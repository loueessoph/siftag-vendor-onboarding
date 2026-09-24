"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ShoppingBag } from "lucide-react";
import { BAG_LIMIT, useCart, type BagItem } from "./cart";

export type SizeOption = {
  size: string | null;
  status: string;
  available_count: number;
  buy_unit_code: string | null;
  available_unit_codes: string[];
};

const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  held: "Held",
  fitting_room: "In fitting room",
  sold: "Sold",
  sold_out: "Sold out",
};

/**
 * Size picker plus the two buttons: "Add to bag" keeps browsing, "Buy now"
 * adds and goes straight to the bag. A pre-selected size (the tag page's
 * scanned garment) skips the choosing.
 */
export function AddToBag({
  product,
  sizes,
  preselect,
}: {
  product: Omit<BagItem, "unitCode" | "size">;
  sizes: SizeOption[];
  /** The unit already in hand, e.g. from a scanned tag. */
  preselect?: { unitCode: string; size: string | null } | null;
}) {
  const cart = useCart();
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(preselect?.size ?? null);
  const [qty, setQty] = useState(1);
  const [flash, setFlash] = useState<string | null>(null);

  const option = sizes.find((s) => (s.size ?? "") === (chosen ?? ""));
  // The garments of this size that could go in the bag: the scanned one
  // first where there is one, then the rest, minus any already in the bag.
  const candidates = (() => {
    if (!option || option.status !== "available") return [];
    const codes = preselect && preselect.size === chosen ? [preselect.unitCode, ...option.available_unit_codes] : option.available_unit_codes;
    return [...new Set(codes)].filter((c) => !cart.has(c));
  })();
  const alreadyIn = option ? option.available_unit_codes.filter((c) => cart.has(c)).length + (preselect && preselect.size === chosen && cart.has(preselect.unitCode) && !option.available_unit_codes.includes(preselect.unitCode) ? 1 : 0) : 0;
  const maxQty = Math.max(0, Math.min(candidates.length, BAG_LIMIT - cart.count));
  const canAdd = maxQty > 0;
  const inBag = alreadyIn > 0 && maxQty === 0;

  function add(): boolean {
    if (!option || maxQty === 0) return false;
    const take = Math.min(qty, maxQty);
    let added = 0;
    for (const unitCode of candidates.slice(0, take)) {
      if (cart.add({ ...product, unitCode, size: option.size })) added++;
    }
    setFlash(added === 0 ? "Already in your bag" : added === 1 ? "Added to your bag" : `Added ${added} to your bag`);
    setTimeout(() => setFlash(null), 2500);
    setQty(1);
    return added > 0;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs uppercase tracking-widest text-gray-500">Size</p>
        <div className="flex flex-wrap gap-2">
          {sizes.map((s) => {
            const key = s.size ?? "";
            const selected = key === (chosen ?? "");
            const buyable = s.status === "available" && s.buy_unit_code;
            return (
              <button
                key={key || "one-size"}
                type="button"
                disabled={!buyable}
                onClick={() => setChosen(s.size)}
                className={`min-w-12 rounded-full border px-4 py-2 text-sm transition-colors ${
                  selected
                    ? "border-gray-900 bg-gray-900 text-white"
                    : buyable
                      ? "border-gray-300 text-gray-900 hover:border-gray-900"
                      : "border-gray-200 text-gray-300 line-through"
                }`}
                title={buyable ? undefined : STATUS_LABEL[s.status] ?? s.status}
              >
                {s.size ?? "One size"}
              </button>
            );
          })}
        </div>
        {option && option.status !== "available" && (
          <p className="mt-2 text-xs text-gray-500">{STATUS_LABEL[option.status] ?? option.status} in this size.</p>
        )}
        {option && option.status === "available" && (maxQty > 1 || alreadyIn > 0) && (
          <div className="mt-4 flex items-center gap-4">
            <span className="text-xs uppercase tracking-widest text-gray-500">Qty</span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="One fewer" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-8 w-8 rounded-full border border-gray-300 text-base leading-none hover:border-gray-900 disabled:opacity-40">−</button>
              <span className="w-5 text-center text-sm tabular-nums">{Math.min(qty, Math.max(1, maxQty))}</span>
              <button type="button" aria-label="One more" disabled={qty >= maxQty} onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="h-8 w-8 rounded-full border border-gray-300 text-base leading-none hover:border-gray-900 disabled:opacity-40">+</button>
            </div>
            <span className="text-xs text-gray-400">
              {alreadyIn > 0 ? `${alreadyIn} in your bag · ` : ""}{candidates.length} left
            </span>
          </div>
        )}
        {!sizes.some((s) => s.status === "available") && (
          <p className="mt-2 text-xs text-gray-500">Nothing in stock in any size right now. Ask floor staff.</p>
        )}
      </div>

      <div className="space-y-2">
        <button
          type="button"
          disabled={!canAdd && !inBag}
          onClick={() => (inBag ? router.push("/popup/bag") : add())}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-xs uppercase tracking-widest text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {inBag ? (
            <>
              <Check className="h-4 w-4" /> In your bag · View
            </>
          ) : (
            <>
              <ShoppingBag className="h-4 w-4" /> {chosen === null && !preselect ? "Select a size" : qty > 1 ? `Add ${Math.min(qty, maxQty)} to bag` : "Add to bag"}
            </>
          )}
        </button>
        {!inBag && (
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => {
              if (add()) router.push("/popup/bag");
            }}
            className="w-full rounded-full border border-gray-900 px-6 py-3 text-xs uppercase tracking-widest text-gray-900 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
          >
            Buy now
          </button>
        )}
        {flash && <p className="text-center text-xs text-gray-500">{flash}</p>}
        <p className="pt-1 text-center text-[11px] leading-relaxed text-gray-400">
          Pay by card online, collect at the Express counter. Secure checkout by Stripe.
        </p>
      </div>
    </div>
  );
}
