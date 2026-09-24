"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { TillLine, TillOrder } from "@/lib/till";
import { CameraScanner } from "@/components/admin/camera-scanner";

type Props = { terminal: boolean; staffName: string };

const money = (n: number) => `£${n.toFixed(2)}`;

/**
 * Scan feedback without an audio file, only for scans (camera, hardware
 * scanner or a typed code), never for the +/- buttons: the single short high
 * beep of a shop barcode scanner when a tag goes in the basket, two low
 * buzzes when it's refused. The AudioContext is created on the first tap (browsers block
 * sound before any gesture) and shared after that.
 */
let audio: AudioContext | null = null;
function prepareAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") audio.resume();
  } catch {
    audio = null;
  }
}
function tone(freq: number, at: number, len: number, type: OscillatorType, volume: number) {
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = audio.currentTime + at;
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.setValueAtTime(volume, t0 + len - 0.01);
  gain.gain.linearRampToValueAtTime(0.0001, t0 + len);
  osc.connect(gain).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + len + 0.02);
}
function beep(kind: "ok" | "error") {
  if (kind === "ok") {
    // Scanner beep: ~2.7kHz, 90ms, flat then off.
    tone(2700, 0, 0.09, "square", 0.08);
  } else {
    tone(330, 0, 0.12, "square", 0.08);
    tone(330, 0.17, 0.12, "square", 0.08);
  }
  if (navigator.vibrate) navigator.vibrate(kind === "ok" ? 40 : [80, 40, 80]);
}

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
        beep("error");
        setError(json.error ?? "Couldn't read that tag.");
        return;
      }
      const line = json as TillLine;
      if (basketRef.current.some((l) => l.unitCode === line.unitCode)) {
        beep("error");
        setError(`${line.unitCode} is already in the basket.`);
        return;
      }
      if (line.status !== "available") {
        beep("error");
        setError(
          line.status === "sold"
            ? `${line.productTitle} (${line.unitCode}) has already been sold.`
            : `${line.productTitle} (${line.unitCode}) is ${line.status.replace("_", " ")} for someone else right now.`
        );
        return;
      }
      beep("ok");
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

  /** One more of the same product and size, from the next spare tag on record (or a fresh one if stock was undercounted). */
  async function addAnother(line: TillLine) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/till/another", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitCode: line.unitCode, exclude: basketRef.current.map((l) => l.unitCode) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't add another.");
        return;
      }
      const extra = json as TillLine & { created: boolean };
      setBasket((b) => [...b, extra]);
      if (extra.created) setError(`No spare tag for ${line.productTitle} (${line.size ?? "one size"}) was on record, so one was added: ${extra.unitCode}.`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
      focus();
    }
  }

  // Lines shown grouped by product, size and colour with a quantity, since
  // two of the same top are two tags underneath.
  const groups = basket.reduce<Array<{ key: string; sample: TillLine; codes: string[] }>>((acc, l) => {
    const key = `${l.brandName}|${l.productTitle}|${l.size ?? ""}|${l.priceGbp}`;
    const g = acc.find((x) => x.key === key);
    if (g) g.codes.push(l.unitCode);
    else acc.push({ key, sample: l, codes: [l.unitCode] });
    return acc;
  }, []);

  async function charge(mode: "terminal" | "qr") {
    if (basket.length === 0) return;
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
            <p className="mt-3 text-sm text-neutral-900">Paid by card. Hand over the items.</p>
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
          {!paid && order.mode !== "cash" && (
            <p className="mt-5 text-xs leading-relaxed text-neutral-400">
              Secure payment by Stripe. Card details never reach Siftag and are not stored.
            </p>
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
          prepareAudio();
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
          onClick={() => {
            prepareAudio();
            setCamera(true);
          }}
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
            {groups.map(({ key, sample, codes }) => (
              <li key={key} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{sample.productTitle}</p>
                  <p className="text-xs text-neutral-500">
                    {sample.brandName}
                    {sample.size ? ` · ${sample.size}` : ""} · {money(sample.priceGbp)} each
                  </p>
                  <p className="font-mono text-[10px] text-neutral-400">{codes.join("  ")}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label="One fewer"
                    onClick={() => remove(codes[codes.length - 1])}
                    className="h-9 w-9 rounded-full border border-neutral-300 text-lg leading-none hover:border-neutral-900"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm tabular-nums">{codes.length}</span>
                  <button
                    type="button"
                    aria-label="One more"
                    disabled={busy}
                    onClick={() => addAnother(sample)}
                    className="h-9 w-9 rounded-full border border-neutral-300 text-lg leading-none hover:border-neutral-900 disabled:opacity-40"
                  >
                    +
                  </button>
                  <span className="w-16 text-right text-sm">{money(sample.priceGbp * codes.length)}</span>
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
        {basket.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Remove every item from the basket?")) newSale();
            }}
            className="w-full py-2 text-xs uppercase tracking-wide text-neutral-400 underline underline-offset-4 hover:text-neutral-900"
          >
            Clear basket
          </button>
        )}
        <p className="pt-2 text-center text-xs leading-relaxed text-neutral-400">
          Card only. Payments are processed securely by Stripe: card details are entered on Stripe&apos;s own page or reader and are never seen or stored by Siftag.
        </p>
      </div>
    </div>
  );
}
