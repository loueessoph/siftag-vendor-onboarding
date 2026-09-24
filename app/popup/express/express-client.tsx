"use client";

import { useEffect, useState } from "react";

interface Props {
  initialCodes: string[];
  /** Set when the shopper came back from Stripe without paying: that order gets released so the items can be bought again. */
  cancelledCode: string | null;
}

export function ExpressCheckoutClient({ initialCodes, cancelledCode }: Props) {
  const [codes, setCodes] = useState<string[]>(initialCodes);
  const [codeInput, setCodeInput] = useState("");
  const [contact, setContact] = useState({ email: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!cancelledCode) return;
    fetch("/api/popup/express/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectCode: cancelledCode }),
    })
      .catch(() => {})
      .finally(() => setNotice("Payment cancelled. Your items are back in the basket below."));
    window.history.replaceState(null, "", "/popup/express");
  }, [cancelledCode]);

  function addCode() {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    if (!codes.includes(code)) setCodes([...codes, code]);
    setCodeInput("");
  }

  function removeCode(code: string) {
    setCodes(codes.filter((c) => c !== code));
  }

  async function submit() {
    if (codes.length === 0) {
      setError("Add at least one item code from a garment tag.");
      return;
    }
    if (!contact.email && !contact.phone) {
      setError("Enter an email or phone number so we can confirm your order.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/popup/express/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitCodes: codes, email: contact.email || undefined, phone: contact.phone || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === "just_missed_it") {
          setError(`Just missed it — someone else got: ${json.unavailableCodes.join(", ")}`);
          setCodes(codes.filter((c) => !json.unavailableCodes.includes(c)));
        } else {
          setError(json.error || "Something went wrong. Try again.");
        }
        setSubmitting(false);
        return;
      }
      // Straight to Stripe's payment page; it returns to the confirm page when paid.
      window.location.assign(json.checkoutUrl);
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xs uppercase tracking-widest text-neutral-500">Item codes</label>
        <p className="text-xs text-neutral-400 mt-0.5">
          Find the code on the garment&apos;s tag QR page, or scan the tag directly.
        </p>
        <div className="flex gap-2 mt-2">
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCode()}
            placeholder="e.g. A1B2C3D4"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm uppercase tracking-wide focus:outline-none focus:ring-1 focus:ring-black"
          />
          <button onClick={addCode} className="rounded-lg border border-neutral-900 px-4 text-sm hover:bg-neutral-50">
            Add
          </button>
        </div>
        {codes.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {codes.map((c) => (
              <li key={c} className="flex items-center justify-between rounded-lg bg-neutral-100 px-3 py-2 text-sm">
                <span className="tracking-wide">{c}</span>
                <button onClick={() => removeCode(c)} className="text-neutral-400 hover:text-neutral-900">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs uppercase tracking-widest text-neutral-500">Contact</label>
        <input
          value={contact.email}
          onChange={(e) => setContact({ ...contact, email: e.target.value })}
          type="email"
          placeholder="Email"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-black"
        />
        <input
          value={contact.phone}
          onChange={(e) => setContact({ ...contact, phone: e.target.value })}
          type="tel"
          placeholder="Phone (optional)"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-black"
        />
      </div>

      {notice && <p className="text-sm text-neutral-600">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting}
        className="w-full rounded-full bg-black text-white py-3 text-sm tracking-wide uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50"
      >
        {submitting ? "Opening payment…" : "Continue to payment"}
      </button>
      <p className="text-xs text-center text-neutral-400">
        No try-on before purchase — this is a pay-now, collect-at-counter order.
      </p>
    </div>
  );
}
