"use client";

import { useEffect, useState } from "react";

/**
 * The red number beside "Order pickup": online orders paid and waiting.
 * Polls every ten seconds and on return to the tab, so whoever is on the
 * floor sees a new order without opening the page. Shows nothing at zero.
 */
export function PickupBadge() {
  const [waiting, setWaiting] = useState<number | null>(null);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/pickup/count", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!stopped && typeof json.waiting === "number") setWaiting(json.waiting);
      } catch {
        /* keep the last number */
      }
    };
    load();
    const id = setInterval(load, 10000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!waiting) return null;
  return (
    <span
      aria-label={`${waiting} order${waiting === 1 ? "" : "s"} waiting`}
      className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 align-middle font-sans text-[10px] font-medium tracking-normal text-white"
    >
      {waiting > 99 ? "99+" : waiting}
    </span>
  );
}
