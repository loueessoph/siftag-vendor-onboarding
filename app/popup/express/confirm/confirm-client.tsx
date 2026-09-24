"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { OrderSummary } from "@/lib/express";

interface Props {
  collectCode: string;
}

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  pending_payment: {
    title: "Almost there",
    body: "Complete payment to lock in your items. This page updates itself once payment lands.",
  },
  paid: {
    title: "Payment received",
    body: "Show this code (or QR) at the Express counter to collect.",
  },
  collected: {
    title: "Collected",
    body: "Enjoy! This order has been picked up.",
  },
  uncollected: {
    title: "Not collected",
    body: "This order was paid but not picked up before the event closed.",
  },
  cancelled: {
    title: "Cancelled",
    body: "This order was cancelled and the items were released back to stock.",
  },
};

export function ConfirmClient({ collectCode }: Props) {
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/popup/express/orders/${collectCode}`, { cache: "no-store" });
        if (!res.ok) {
          setError("Order not found.");
          return;
        }
        const json: OrderSummary = await res.json();
        setOrder(json);
        if (json.status !== "pending_payment" && pollRef.current) {
          clearInterval(pollRef.current);
        }
      } catch {
        setError("Network error loading order.");
      }
    }
    load();
    pollRef.current = setInterval(load, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [collectCode]);

  useEffect(() => {
    if (order && order.status !== "pending_payment") {
      QRCode.toDataURL(collectCode, { width: 240, margin: 1 }).then(setQrDataUrl).catch(() => {});
    }
  }, [order, collectCode]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!order) return <p className="text-sm text-neutral-400">Loading…</p>;

  const copy = STATUS_COPY[order.status] ?? STATUS_COPY.pending_payment;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-display text-neutral-900">{copy.title}</h2>
        <p className="text-sm text-neutral-500 mt-1">{copy.body}</p>
      </div>

      {order.status === "pending_payment" && order.checkout_url && (
        <a
          href={order.checkout_url}
          className="block w-full text-center rounded-full bg-black text-white py-3 text-sm tracking-wide uppercase hover:bg-neutral-800 transition-colors"
        >
          Pay now — £{order.subtotal_gbp?.toFixed(2)}
        </a>
      )}

      {order.status !== "pending_payment" && (
        <div className="flex flex-col items-center gap-3 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qrDataUrl && <img src={qrDataUrl} alt="Collect QR" className="h-48 w-48" />}
          <p className="text-2xl font-mono tracking-[0.3em] text-neutral-900">{order.collect_code}</p>
        </div>
      )}

      <div className="border-t border-neutral-200 pt-4 space-y-2">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Items</p>
        {order.items.map((item) => (
          <div key={item.unit_code} className="flex justify-between text-sm text-neutral-700">
            <span>
              {item.product_title} — {item.brand_name}
              {item.size ? ` (${item.size})` : ""}
            </span>
            <span>£{item.price_gbp.toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between text-sm font-medium text-neutral-900 pt-2 border-t border-neutral-100">
          <span>Total</span>
          <span>£{order.subtotal_gbp?.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
