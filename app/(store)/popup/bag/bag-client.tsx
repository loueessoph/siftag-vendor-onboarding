"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sized } from "@/lib/images";
import { PhotoPlaceholder } from "@/components/store/photo-placeholder";
import { X } from "lucide-react";
import { BAG_LIMIT, useCart } from "@/components/store/cart";

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
  const [contact, setContact] = useState({ firstName: "", lastName: "", email: "", phone: "" });
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
    const firstName = contact.firstName.trim();
    const lastName = contact.lastName.trim();
    const email = contact.email.trim();
    const phone = contact.phone.trim();
    if (!firstName || !lastName) {
      setError("Enter your first and last name.");
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email for your confirmation and pickup code.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 7) {
      setError("Enter a phone number we can reach you on about your order.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/popup/express/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitCodes: buyable.map((i) => i.unitCode),
          name: `${firstName} ${lastName}`,
          email,
          phone,
        }),
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

  // One line per product and size, with a quantity; the garments underneath stay separate.
  const groups = cart.items.reduce<Array<{ key: string; sample: (typeof cart.items)[number]; codes: string[] }>>((acc, item) => {
    const key = `${item.productId}|${item.size ?? ""}|${item.colour ?? ""}`;
    const g = acc.find((x) => x.key === key);
    if (g) g.codes.push(item.unitCode);
    else acc.push({ key, sample: item, codes: [item.unitCode] });
    return acc;
  }, []);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function oneMore(group: (typeof groups)[number]) {
    if (cart.count >= BAG_LIMIT) {
      setError(`Your bag is full (${BAG_LIMIT} items).`);
      return;
    }
    setBusyKey(group.key);
    setError(null);
    try {
      const res = await fetch("/api/popup/cart/another", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitCode: group.codes[0], exclude: cart.items.map((i) => i.unitCode) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "No more of that size in stock.");
        return;
      }
      cart.add(json);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusyKey(null);
    }
  }

  if (!cart.ready) return <p className="text-sm text-gray-400">Loading…</p>;

  if (cart.items.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-gray-500">Your bag is empty.</p>
        {notice && <p className="mt-2 text-xs text-gray-400">{notice}</p>}
        <Link href="/popup" className="mt-6 inline-block rounded-full bg-gray-900 px-6 py-3 text-xs uppercase tracking-widest text-white hover:bg-gray-800">
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
          {groups.map(({ key, sample, codes }) => {
            const goneCodes = codes.filter((c) => statuses[c] && statuses[c] !== "available");
            const liveCount = codes.length - goneCodes.length;
            return (
              <li key={key} className={`flex gap-4 py-4 ${liveCount === 0 ? "opacity-60" : ""}`}>
                <Link href={`/popup/product/${sample.productId}`} className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-200">
                  {sample.imageUrl ? <Image src={sized(sample.imageUrl, 200)} alt={sample.title} fill sizes="80px" className="object-cover object-top" /> : <PhotoPlaceholder />}
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs uppercase tracking-widest text-gray-400">{sample.brandName}</p>
                  <Link href={`/popup/product/${sample.productId}`} className="block truncate text-sm text-gray-900">
                    {sample.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {[sample.colour, sample.size ? `Size ${sample.size}` : "One size"].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label="One fewer"
                        onClick={() => cart.remove(codes[codes.length - 1])}
                        className="h-7 w-7 rounded-full border border-gray-300 text-sm leading-none hover:border-gray-900"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm tabular-nums">{codes.length}</span>
                      <button
                        type="button"
                        aria-label="One more"
                        disabled={busyKey === key}
                        onClick={() => oneMore({ key, sample, codes })}
                        className="h-7 w-7 rounded-full border border-gray-300 text-sm leading-none hover:border-gray-900 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <span className="text-sm text-gray-900">{money(sample.priceGbp * liveCount)}</span>
                    {codes.length > 1 && <span className="text-xs text-gray-400">{money(sample.priceGbp)} each</span>}
                  </div>
                  {goneCodes.length > 0 && (
                    <p className="mt-1 text-xs text-red-600">
                      {goneCodes.length === codes.length ? "No longer available, sorry. It won't be charged." : `${goneCodes.length} of these just sold; ${liveCount} will be charged.`}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => cart.removeMany(codes)}
                  aria-label={`Remove ${sample.title}`}
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
          <Link href="/popup" className="text-gray-400 underline underline-offset-4 hover:text-gray-900">
            Keep browsing
          </Link>
        </div>
      </div>

      <aside className="md:sticky md:top-4 md:self-start">
        <div className="flex items-baseline justify-between">
          <span className="text-xs tracking-widest text-gray-500">TOTAL</span>
          <span className="text-xl text-gray-900">{money(total)}</span>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-5">
          <Field label="FIRST NAME" value={contact.firstName} onChange={(v) => setContact({ ...contact, firstName: v })} autoComplete="given-name" placeholder="Ada" />
          <Field label="LAST NAME" value={contact.lastName} onChange={(v) => setContact({ ...contact, lastName: v })} autoComplete="family-name" placeholder="Lovelace" />
          <div className="col-span-2">
            <Field label="EMAIL" type="email" value={contact.email} onChange={(v) => setContact({ ...contact, email: v })} autoComplete="email" placeholder="you@example.com" />
            <p className="mt-1.5 text-[11px] text-gray-400">Your confirmation and pickup code go here.</p>
          </div>
          <div className="col-span-2">
            <Field label="PHONE" type="tel" value={contact.phone} onChange={(v) => setContact({ ...contact, phone: v })} autoComplete="tel" placeholder="07700 900000" />
            <p className="mt-1.5 text-[11px] text-gray-400">Only used if we need to reach you about this order.</p>
          </div>
          <p className="col-span-2 text-[11px] text-gray-400">
            <span className="text-red-600">*</span> All fields are required.
          </p>
        </div>

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

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] tracking-widest text-gray-500">
        {label} <span className="text-red-600" aria-hidden="true">*</span>
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        className="mt-1 w-full border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:border-gray-900 focus:outline-none focus:ring-0"
      />
    </label>
  );
}
