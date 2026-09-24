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
  const [flash, setFlash] = useState<string | null>(null);

  const option = sizes.find((s) => (s.size ?? "") === (chosen ?? ""));
  const unitCode = preselect && preselect.size === chosen ? preselect.unitCode : option?.buy_unit_code ?? null;
  const inBag = unitCode ? cart.has(unitCode) : false;
  const canAdd = Boolean(unitCode) && option?.status === "available" && !inBag;

  function add(): boolean {
    if (!unitCode || !option) return false;
    if (cart.count >= BAG_LIMIT) {
      setFlash(`Your bag is full (${BAG_LIMIT} items).`);
      return false;
    }
    const ok = cart.add({ ...product, unitCode, size: option.size });
    setFlash(ok ? "Added to your bag" : "Already in your bag");
    setTimeout(() => setFlash(null), 2500);
    return ok;
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
              <ShoppingBag className="h-4 w-4" /> {chosen === null && !preselect ? "Select a size" : "Add to bag"}
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
