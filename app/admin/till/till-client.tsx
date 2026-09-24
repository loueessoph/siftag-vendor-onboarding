"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import type { TillLine, TillOrder } from "@/lib/till";

type Props = { terminal: boolean; staffName: string };

const money = (n: number) => `£${n.toFixed(2)}`;

/** A scanner types the tag URL or code and presses Enter; the same box takes a typed code. */
export function TillClient({ terminal, staffName }: Props) {
  const [basket, setBasket] = useState<TillLine[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<TillOrder | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [camera, setCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const total = basket.reduce((s, l) => s + l.priceGbp, 0);

  const focus = useCallback(() => inputRef.current?.focus(), []);
  useEffect(() => {
    if (!order) focus();
  }, [order, focus]);

  // The camera hands over the same string a scanner would; the basket check
  // below runs against the latest basket, not a stale closure.
  const basketRef = useRef(basket);
  basketRef.current = basket;

  async function addCode(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/till/unit?code=${encodeURIComponent(value)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't read that tag.");
        return;
      }
      const line = json as TillLine;
      if (basketRef.current.some((l) => l.unitCode === line.unitCode)) {
        setError(`${line.unitCode} is already in the basket.`);
        return;
      }
      if (line.status !== "available") {
        setError(
          line.status === "sold"
            ? `${line.productTitle} (${line.unitCode}) has already been sold.`
            : `${line.productTitle} (${line.unitCode}) is ${line.status.replace("_", " ")} for someone else right now.`
        );
        return;
      }
      setBasket((b) => [...b, line]);
    } catch {
      setError("Network error. Scan it again.");
    } finally {
      setBusy(false);
      setInput("");
      focus();
    }
  }

  function remove(code: string) {
    setBasket((b) => b.filter((l) => l.unitCode !== code));
    focus();
  }

  async function charge(mode: "terminal" | "qr" | "cash") {
    if (basket.length === 0) return;
    if (mode === "cash" && !window.confirm(`Take ${money(total)} in cash and mark these ${basket.length} item${basket.length === 1 ? "" : "s"} as sold?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/till/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitCodes: basket.map((l) => l.unitCode), mode, email: email || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === "just_missed_it") {
          const lost: string[] = json.unavailableCodes ?? [];
          setBasket((b) => b.filter((l) => !lost.includes(l.unitCode)));
          setError(`Just taken by someone else: ${lost.join(", ")}. Removed from the basket.`);
        } else {
          setError(json.error ?? "Couldn't start the payment.");
        }
        return;
      }
      setOrder(json as TillOrder);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // While a card payment is in flight, poll until it lands.
  useEffect(() => {
    if (!order || order.status !== "pending_payment") return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/admin/till/status?code=${order.collectCode}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as TillOrder;
        if (!stopped) setOrder((o) => (o ? { ...o, ...json, checkoutUrl: json.checkoutUrl ?? o.checkoutUrl } : json));
      } catch {
        /* keep polling */
      }
    };
    const id = setInterval(tick, 2500);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [order]);

  useEffect(() => {
    if (order?.mode === "qr" && order.checkoutUrl) {
      QRCode.toDataURL(order.checkoutUrl, { width: 320, margin: 1 }).then(setQr).catch(() => setQr(null));
    } else {
      setQr(null);
    }
  }, [order?.mode, order?.checkoutUrl]);

  async function cancelOrder() {
    if (!order) return;
    setBusy(true);
    try {
      await fetch("/api/admin/till/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectCode: order.collectCode }),
      });
    } finally {
      setBusy(false);
      setOrder(null);
      setError("Sale cancelled. Items are back on the floor.");
    }
  }

  async function retry() {
    if (!order) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/till/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectCode: order.collectCode }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Couldn't retry.");
      else setOrder((o) => (o ? { ...o, message: undefined } : o));
    } finally {
      setBusy(false);
    }
  }

  function newSale() {
    setOrder(null);
    setBasket([]);
    setEmail("");
    setError(null);
  }

  /* ---- payment in flight / done ---- */
  if (order) {
    const paid = order.status === "paid";
    return (
      <div className="mx-auto max-w-md space-y-8">
        <div className="border border-neutral-900 p-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Order {order.collectCode}</p>
          <p className="mt-3 font-display text-4xl">{money(order.totalGbp)}</p>
          {paid ? (
            <p className="mt-3 text-sm text-neutral-900">
              Paid {order.mode === "cash" ? "in cash" : "by card"}. Hand over the items.
            </p>
          ) : order.status === "cancelled" ? (
            <p className="mt-3 text-sm text-red-600">{order.message ?? "This sale was cancelled."}</p>
          ) : order.mode === "terminal" ? (
            <p className="mt-3 text-sm text-neutral-500">
              Waiting for the card reader{order.readerLabel ? ` (${order.readerLabel})` : ""}. Ask them to tap or insert.
            </p>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">Ask them to scan this with their phone camera and pay.</p>
          )}
          {!paid && order.mode === "qr" && qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Scan to pay" className="mx-auto mt-6 h-64 w-64" />
          )}
          {!paid && order.mode === "qr" && order.checkoutUrl && (
            <a href={order.checkoutUrl} target="_blank" rel="noreferrer" className="mt-3 block text-xs text-neutral-500 underline underline-offset-2">
              Open the payment page instead
            </a>
          )}
          {!paid && order.status === "pending_payment" && order.message && (
            <p className="mt-4 text-sm text-red-600">{order.message}</p>
          )}
        </div>

        <div className="space-y-3">
          {paid || order.status === "cancelled" ? (
            <button onClick={newSale} className="w-full rounded-full bg-black py-4 text-sm uppercase tracking-wide text-white">
              New sale
            </button>
          ) : (
            <>
              {order.mode === "terminal" && order.message && (
                <button onClick={retry} disabled={busy} className="w-full rounded-full bg-black py-4 text-sm uppercase tracking-wide text-white disabled:opacity-50">
                  Try the card again
                </button>
              )}
              <p className="text-center text-xs text-neutral-400">This screen updates itself when the payment lands.</p>
              <button onClick={cancelOrder} disabled={busy} className="w-full rounded-full border border-neutral-300 py-4 text-sm uppercase tracking-wide text-neutral-700 disabled:opacity-50">
                Cancel sale
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ---- basket ---- */
  return (
    <div className="mx-auto max-w-md space-y-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addCode(input);
        }}
      >
        <label className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Scan or type a tag</label>
        <div className="mt-2 flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="A1B2C3D4"
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            className="flex-1 rounded-lg border border-neutral-300 px-4 py-3 text-lg uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-black"
          />
          <button type="submit" disabled={busy} className="rounded-lg border border-neutral-900 px-5 text-sm uppercase tracking-wide disabled:opacity-50">
            Add
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-400">
          Point the camera at the tag&apos;s QR, or type the code printed under it. Signed in as {staffName}.
        </p>
      </form>

      {camera ? (
        <CameraScanner onCode={addCode} onClose={() => setCamera(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setCamera(true)}
          className="w-full rounded-full border border-neutral-900 py-4 text-sm uppercase tracking-wide"
        >
          Scan with camera
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        {basket.length === 0 ? (
          <p className="border border-dashed border-neutral-300 px-6 py-10 text-center text-sm text-neutral-400">Basket is empty.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
            {basket.map((l) => (
              <li key={l.unitCode} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{l.productTitle}</p>
                  <p className="text-xs text-neutral-500">
                    {l.brandName}
                    {l.size ? ` · ${l.size}` : ""} · <span className="font-mono">{l.unitCode}</span>
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm">{money(l.priceGbp)}</span>
                  <button onClick={() => remove(l.unitCode)} className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-900">
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-baseline justify-between pt-4">
          <span className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Total</span>
          <span className="font-display text-3xl">{money(total)}</span>
        </div>
      </div>

      <div className="space-y-3">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Email for a receipt (optional)"
          className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-black"
        />
        <button
          onClick={() => charge(terminal ? "terminal" : "qr")}
          disabled={busy || basket.length === 0}
          className="w-full rounded-full bg-black py-4 text-sm uppercase tracking-wide text-white disabled:opacity-40"
        >
          {terminal ? `Charge ${money(total)} on card reader` : `Charge ${money(total)} by card (QR)`}
        </button>
        <button
          onClick={() => charge("cash")}
          disabled={busy || basket.length === 0}
          className="w-full rounded-full border border-neutral-900 py-4 text-sm uppercase tracking-wide disabled:opacity-40"
        >
          Paid in cash
        </button>
      </div>
    </div>
  );
}

/**
 * Live camera view that reads QR codes in the page, so a phone is enough to
 * run the till. Keeps scanning after each read; the same tag is ignored for
 * a few seconds so holding it in frame doesn't add it twice. Needs HTTPS
 * (or localhost) for the browser to allow the camera at all.
 */
function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<string>("Starting camera…");
  const [flash, setFlash] = useState<string | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const recent = new Map<string, number>();

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("This browser can't open the camera here. Use the code under the QR instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        setStatus("Camera permission was refused. Allow it in the browser, or type the code instead.");
        return;
      }
      const video = videoRef.current;
      if (!video || stopped) return;
      video.srcObject = stream;
      await video.play();
      setStatus("Hold a tag's QR in view.");
      let last = 0;
      const tick = (now: number) => {
        if (stopped) return;
        raf = requestAnimationFrame(tick);
        if (now - last < 120 || !ctx || video.readyState < 2) return;
        last = now;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
        if (!found?.data) return;
        const seen = recent.get(found.data) ?? 0;
        if (now - seen < 4000) return;
        recent.set(found.data, now);
        if (navigator.vibrate) navigator.vibrate(60);
        setFlash(found.data.split("/").pop() ?? found.data);
        setTimeout(() => setFlash(null), 1200);
        onCodeRef.current(found.data);
      };
      raf = requestAnimationFrame(tick);
    }
    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-44 w-44 rounded-lg border-2 border-white/70" />
        </div>
        {flash && (
          <div className="absolute inset-x-0 bottom-0 bg-white/90 py-2 text-center text-sm tracking-widest text-neutral-900">
            Added {flash}
          </div>
        )}
      </div>
      <p className="text-center text-xs text-neutral-500">{status}</p>
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-full border border-neutral-300 py-3 text-sm uppercase tracking-wide text-neutral-700"
      >
        Close camera
      </button>
    </div>
  );
}
