"use client";

import Image from "next/image";
import { sized } from "@/lib/images";
import { PhotoPlaceholder } from "@/components/store/photo-placeholder";
import { useCallback, useEffect, useState } from "react";
import type { PickupOrder } from "@/lib/pickup";
import { CameraScanner } from "@/components/admin/camera-scanner";

const money = (n: number) => `£${n.toFixed(2)}`;
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const TIME_S = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/London" });

/**
 * Two halves. The list: every paid online order, oldest first, with who's
 * taking it and whether it's packed. The confirm box: scan the QR on the
 * customer's phone (their confirm page) or type the code to hand it over.
 * Refreshes itself every few seconds so two counters see the same thing.
 */
export function PickupClient() {
  const [orders, setOrders] = useState<PickupOrder[] | null>(null);
  const [me, setMe] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/pickup", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(json.detail ?? json.error ?? `The server answered ${res.status}.`);
        return;
      }
      setOrders(json.orders);
      setMe(json.me);
      setLoadError(null);
      setUpdatedAt(new Date());
    } catch {
      setLoadError("Can't reach the server. Check the connection; this page keeps retrying.");
    } finally {
      setRefreshing(false);
    }
  }, []);
  // Live: every five seconds, plus whenever the tab comes back into view.
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  async function act(collectCode: string, action: "take" | "release" | "packed" | "unpacked" | "collected") {
    setBusy(collectCode);
    setError(null);
    try {
      const res = await fetch("/api/admin/pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectCode, action }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message ?? json.error ?? "That didn't work.");
        return false;
      }
      if (action === "collected") setNotice(`${collectCode.toUpperCase()} collected. Thanks!`);
      else if (action === "packed") setNotice(`${collectCode.toUpperCase()} is ready for pickup. ${json.message ?? ""}`.trim());
      else setNotice(null);
      await load();
      return true;
    } catch {
      setError("Network error. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  /** The confirm page QR encodes just the collect code; a typed code is the same thing. */
  function codeFrom(raw: string) {
    const m = raw.trim().match(/([A-Za-z0-9]{6})$/);
    return (m ? m[1] : raw.trim()).toUpperCase();
  }
  async function confirm(raw: string) {
    const c = codeFrom(raw);
    if (!c) return;
    const ok = await act(c, "collected");
    if (ok) setCode("");
  }

  const waiting = orders?.filter((o) => o.status === "paid") ?? [];
  const done = orders?.filter((o) => o.status === "collected") ?? [];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
      <div className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.15em] text-neutral-400">
          <span>
            {loadError ? "Not updating" : updatedAt ? `Live · updated ${TIME_S.format(updatedAt)}` : "Connecting…"}
          </span>
          <button type="button" onClick={load} disabled={refreshing} className="underline underline-offset-4 hover:text-neutral-900 disabled:opacity-50">
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {loadError && (
          <div className="mb-4 border border-red-600 px-4 py-3 text-sm text-red-600">
            <p className="font-medium">Couldn&apos;t load the orders.</p>
            <p className="mt-1">{loadError}</p>
            <p className="mt-1 text-xs text-red-500">Retrying every few seconds.</p>
          </div>
        )}
        {error && <p className="mb-4 border border-red-600 px-4 py-3 text-sm text-red-600">{error}</p>}
        {notice && <p className="mb-4 border border-neutral-900 px-4 py-3 text-sm">{notice}</p>}

        {orders === null ? (
          !loadError && <p className="text-sm text-neutral-400">Fetching orders…</p>
        ) : waiting.length === 0 ? (
          <div className="border border-dashed border-neutral-300 px-6 py-16 text-center text-sm text-neutral-500">
            No online orders waiting. New ones appear here the moment they&apos;re paid.
          </div>
        ) : (
          <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
            {waiting.map((o) => {
              const mine = o.handler === me;
              return (
                <li key={o.collectCode} className="py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-mono text-lg tracking-[0.2em]">{o.collectCode}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {o.paidAt ? `Paid ${TIME.format(new Date(o.paidAt))}` : "Paid"} · {money(o.totalGbp)} ·{" "}
                        {o.items.length} item{o.items.length === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 text-sm">
                        <span className="font-medium">{o.customer.name ?? "Name not given"}</span>
                        {o.customer.phone && (
                          <>
                            {" · "}
                            <a href={`tel:${o.customer.phone.replace(/\s+/g, "")}`} className="underline underline-offset-4">
                              {o.customer.phone}
                            </a>
                          </>
                        )}
                        {o.customer.email && <span className="text-neutral-500"> · {o.customer.email}</span>}
                      </p>
                      <ul className="mt-3 space-y-2">
                        {o.items.map((it) => (
                          <li key={it.unitCode} className="flex items-center gap-3">
                            <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-neutral-100">
                              {it.imageUrl ? (
                                <Image src={sized(it.imageUrl, 160)} alt="" fill sizes="64px" className="object-cover" />
                              ) : (
                                <PhotoPlaceholder />
                              )}
                            </div>
                            <div className="min-w-0 text-sm">
                              <p className="font-medium">{it.productTitle}</p>
                              <p className="text-neutral-500">
                                {it.brandName}
                                {it.size ? ` · Size ${it.size}` : ""}
                              </p>
                              <p className="font-mono text-xs text-neutral-400">Tag {it.unitCode}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex w-full flex-col items-stretch gap-2 sm:w-52 sm:shrink-0">
                      {o.packedAt ? (
                        <span className="border border-neutral-900 px-3 py-2 text-center text-[11px] uppercase tracking-[0.15em]">
                          Ready for pickup{o.handler ? ` · packed by ${o.handler}` : ""}
                        </span>
                      ) : o.handler ? (
                        <span className="border border-neutral-300 px-3 py-2 text-center text-[11px] uppercase tracking-[0.15em] text-neutral-600">
                          {mine ? "You're packing this" : `${o.handler} is packing this`}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy === o.collectCode}
                          onClick={() => act(o.collectCode, "take")}
                          className="bg-neutral-900 px-3 py-2 text-[11px] uppercase tracking-[0.15em] text-white hover:bg-neutral-800 disabled:opacity-50"
                        >
                          Start packing
                        </button>
                      )}
                      {!o.packedAt && (mine || !o.handler) && (
                        <button
                          type="button"
                          disabled={busy === o.collectCode}
                          onClick={() => act(o.collectCode, "packed")}
                          className="border border-neutral-900 px-3 py-2 text-[11px] uppercase tracking-[0.15em] hover:bg-neutral-50 disabled:opacity-50"
                        >
                          Mark ready for pickup
                        </button>
                      )}
                      {o.packedAt && (
                        <button
                          type="button"
                          disabled={busy === o.collectCode}
                          onClick={() => act(o.collectCode, "collected")}
                          className="bg-neutral-900 px-3 py-2 text-[11px] uppercase tracking-[0.15em] text-white hover:bg-neutral-800 disabled:opacity-50"
                        >
                          Customer has collected
                        </button>
                      )}
                      {(mine || o.packedAt) && (
                        <button
                          type="button"
                          disabled={busy === o.collectCode}
                          onClick={() => act(o.collectCode, o.packedAt ? "unpacked" : "release")}
                          className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 underline underline-offset-4 hover:text-neutral-900"
                        >
                          {o.packedAt ? "Undo: not ready yet" : "Stop packing this"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {done.length > 0 && (
          <div className="mt-10">
            <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Collected in the last two hours</p>
            <ul className="mt-3 divide-y divide-neutral-100 border-y border-neutral-100 text-sm text-neutral-500">
              {done.map((o) => (
                <li key={o.collectCode} className="flex justify-between py-2">
                  <span className="font-mono tracking-[0.2em]">{o.collectCode}</span>
                  <span>{o.items.length} item{o.items.length === 1 ? "" : "s"}{o.handler ? ` · ${o.handler}` : ""}{o.collectedAt ? ` · ${TIME.format(new Date(o.collectedAt))}` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="border border-neutral-200 p-4 sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Confirm a pickup</p>
          <p className="mt-1 text-sm text-neutral-500">Scan the QR on the customer&apos;s phone, or type their pickup code.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirm(code);
            }}
            className="mt-4 flex gap-2"
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABC123"
              autoCapitalize="characters"
              autoComplete="off"
              size={8}
              className="w-full min-w-0 flex-1 border border-neutral-300 px-3 py-2.5 font-mono text-base uppercase tracking-[0.2em] focus:border-neutral-900 focus:outline-none"
            />
            <button type="submit" disabled={!code.trim() || busy !== null} className="shrink-0 bg-neutral-900 px-4 text-[11px] uppercase tracking-[0.15em] text-white disabled:opacity-50">
              Confirm
            </button>
          </form>
          <div className="mt-3">
            {camera ? (
              <CameraScanner
                onCode={(raw) => {
                  confirm(raw);
                  setCamera(false);
                }}
                onClose={() => setCamera(false)}
              />
            ) : (
              <button type="button" onClick={() => setCamera(true)} className="w-full border border-neutral-900 py-2.5 text-[11px] uppercase tracking-[0.15em] hover:bg-neutral-50">
                Scan with camera
              </button>
            )}
          </div>
        </div>
        <p className="text-xs leading-relaxed text-neutral-400">
          Confirming marks the order as collected. If a customer arrives before their order is packed, hand it over and confirm anyway.
        </p>
      </aside>
    </div>
  );
}
