"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OrderLookup() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = code.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (clean.length < 4) {
      setError("Enter the pickup code from your confirmation.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/popup/express/orders/${clean}`, { cache: "no-store" });
      if (res.status === 404) {
        setError("We couldn't find an order with that code. Check the confirmation email and try again.");
        setChecking(false);
        return;
      }
      if (!res.ok) throw new Error();
      router.push(`/popup/express/confirm/${clean}`);
    } catch {
      setError("Something went wrong. Try again.");
      setChecking(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8">
      <label className="block">
        <span className="text-[11px] tracking-widest text-gray-500">PICKUP CODE</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABC123"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={8}
          className="mt-1 w-full border-0 border-b border-gray-300 bg-transparent px-0 py-2 font-mono text-lg uppercase tracking-[0.3em] text-gray-900 placeholder:text-gray-300 focus:border-gray-900 focus:outline-none focus:ring-0"
        />
      </label>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={checking}
        className="mt-6 w-full rounded-full bg-gray-900 px-6 py-3 text-xs uppercase tracking-widest text-white transition-colors hover:bg-gray-800 disabled:bg-gray-300"
      >
        {checking ? "Looking it up…" : "Show my order"}
      </button>
    </form>
  );
}
