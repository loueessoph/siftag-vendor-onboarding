"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sized } from "@/lib/images";
import { X } from "lucide-react";
import { useCart } from "@/components/store/cart";

const money = (n: number) => `£${n.toFixed(2)}`;

/**
 * The bag and the checkout form in one place. Items are checked against
 * live stock when the page opens; anything that sold meanwhile is flagged
 * and dropped before payment. Paying claims every item at once and sends
 * the shopper to Stripe; they come back to the confirm page with a collect
 * code, or here if they back out.
 */
export function BagClient({ cancelledCode }: { cancelledCode: string | null }) {
  const cart = useCart();
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [contact, setContact] = useState({ email: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Came back from Stripe without paying: release the held items right away.
  useEffect(() => {
    if (!cancelledCode) return;
    fetch("/api/popup/express/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectCode: cancelledCode }),
    })
      .catch(() => {})
      .finally(() => setNotice("Payment cancelled. Your items are still in your bag."));
    window.history.replaceState(null, "", "/popup/bag");
  }, [cancelledCode]);

  // Live stock check for what's in the bag.
  useEffect(() => {
    if (!cart.ready || cart.items.length === 0) return;
    const codes = cart.items.map((i) => i.unitCode);
    fetch("/api/popup/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => json && setStatuses(json.statuses ?? {}))
      .catch(() => {});
  }, [cart.ready, cart.items]);

  const unavailable = cart.items.filter((i) => statuses[i.unitCode] && statuses[i.unitCode] !== "available");
  const buyable = cart.items.filter((i) => !statuses[i.unitCode] || statuses[i.unitCode] === "available");
  const total = buyable.reduce((s, i) => s + i.priceGbp, 0);

  async function checkout() {
    if (buyable.length === 0) return;
    if (!contact.email.trim()) {
      setError("Enter your email for the collection code.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/popup/express/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitCodes: buyable.map((i) => i.unitCode), email: contact.email.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === "just_missed_it") {
          const lost: string[] = json.unavailableCodes ?? [];
          cart.removeMany(lost);
          setError(`Just missed it: someone else took ${lost.length === 1 ? "an item" : `${lost.length} items`} from your bag. They've been removed; the rest is still here.`);
        } else {
          setError(json.error || "Something went wrong. Try again.");
        }
        setSubmitting(false);
        return;
      }
      window.location.assign(json.checkoutUrl);
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  if (!cart.ready) return <p className="text-sm text-gray-400">Loading…</p>;

  if (cart.items.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-gray-500">Your bag is empty.</p>
        {notice && <p className="mt-2 text-xs text-gray-400">{notice}</p>}
        <Link href="/" className="mt-6 inline-block rounded-full bg-gray-900 px-6 py-3 text-xs uppercase tracking-widest text-white hover:bg-gray-800">
          Browse the pop-up
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_18rem]">
      <div>
        {notice && <p className="mb-4 text-sm text-gray-600">{notice}</p>}
        <ul className="divide-y divide-gray-100 border-y border-gray-100">
          {cart.items.map((item) => {
            const gone = statuses[item.unitCode] && statuses[item.unitCode] !== "available";
            return (
              <li key={item.unitCode} className={`flex gap-4 py-4 ${gone ? "opacity-60" : ""}`}>
                <Link href={`/popup/product/${item.productId}`} className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-200">
                  {item.imageUrl && <Image src={sized(item.imageUrl, 200)} alt={item.title} fill sizes="80px" className="object-cover object-top" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs uppercase tracking-widest text-gray-400">{item.brandName}</p>
                  <Link href={`/popup/product/${item.productId}`} className="block truncate text-sm text-gray-900">
                    {item.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {[item.colour, item.size ? `Size ${item.size}` : "One size"].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 text-sm text-gray-900">{money(item.priceGbp)}</p>
                  {gone && <p className="mt-1 text-xs text-red-600">No longer available, sorry. It won't be charged.</p>}
                </div>
                <button
                  type="button"
                  onClick={() => cart.remove(item.unitCode)}
                  aria-label={`Remove ${item.title}`}
                  className="self-start rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-between pt-3 text-xs">
          <button type="button" onClick={cart.clear} className="text-gray-400 underline underline-offset-4 hover:text-gray-900">
            Clear bag
          </button>
          <Link href="/" className="text-gray-400 underline underline-offset-4 hover:text-gray-900">
            Keep browsing
          </Link>
        </div>
      </div>

      <aside className="md:sticky md:top-4 md:self-start">
        <div className="flex items-baseline justify-between">
          <span className="text-xs tracking-widest text-gray-500">TOTAL</span>
          <span className="text-xl text-gray-900">{money(total)}</span>
        </div>

        <label className="mt-8 block">
          <span className="text-[11px] tracking-widest text-gray-500">EMAIL</span>
          <input
            value={contact.email}
            onChange={(e) => setContact({ ...contact, email: e.target.value })}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-1 w-full border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:border-gray-900 focus:outline-none focus:ring-0"
          />
        </label>
        <p className="mt-1.5 text-[11px] text-gray-400">We'll send your confirmation and collection code here.</p>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={checkout}
          disabled={submitting || buyable.length === 0}
          className="mt-6 w-full rounded-full bg-gray-900 px-6 py-3 text-xs uppercase tracking-widest text-white transition-colors hover:bg-gray-800 disabled:bg-gray-300"
        >
          {submitting ? "Opening secure checkout…" : `Pay ${money(total)}`}
        </button>
        <p className="mt-3 text-center text-[11px] text-gray-400">Secure checkout by Stripe · collect at the Express counter</p>
        {unavailable.length > 0 && (
          <p className="mt-3 text-[11px] text-gray-500">{unavailable.length} item{unavailable.length === 1 ? "" : "s"} can no longer be bought and won&apos;t be charged.</p>
        )}
      </aside>
    </div>
  );
}
