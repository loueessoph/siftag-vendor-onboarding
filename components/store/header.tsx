"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ShoppingBag } from "lucide-react";
import { useCart } from "./cart";

/** The shop sections. The browse page reads `section` from the URL. */
export const SECTIONS: { key: string; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "women", label: "WOMEN" },
  { key: "men", label: "MEN" },
  { key: "accessories", label: "ACCESSORIES" },
];

/**
 * siftag.com's header, pared down for the pop-up: the wordmark centred, the
 * bag on the right, and the section links in a row beneath. No accounts,
 * so no favourites or log in.
 */
export function StoreHeader() {
  return (
    <header className="w-full bg-white" role="banner">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 pt-3 md:px-6">
        <div className="flex flex-1 items-center">
          <span className="hidden text-[11px] tracking-widest text-gray-500 md:inline">FABRICA X · 25–27 SEPT</span>
        </div>
        <div className="shrink-0">
          <Link href="/" aria-label="Siftag Pop-Up home">
            <Image src="/SiftagLogo.png" alt="Siftag" width={100} height={33} className="h-auto w-[100px] md:w-[120px]" priority />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-end gap-1 md:gap-3">
          <BagButton />
        </div>
      </div>
      <Suspense fallback={<div className="h-10" />}>
        <SectionNav />
      </Suspense>
    </header>
  );
}

function BagButton() {
  const { count, ready } = useCart();
  return (
    <Link
      href="/popup/bag"
      aria-label={`Bag, ${count} item${count === 1 ? "" : "s"}`}
      className="relative rounded-full p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 md:p-2"
    >
      <ShoppingBag className="h-5 w-5" />
      {ready && count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gray-900 px-1 text-[10px] font-medium text-white">
          {count}
        </span>
      )}
    </Link>
  );
}

function SectionNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const onBrowse = pathname === "/" || pathname === "/popup";
  const active = onBrowse ? (params.get("section") ?? "all") : null;
  return (
    <nav className="relative bg-white">
      <div className="scrollbar-hide flex justify-start gap-8 overflow-x-auto px-6 py-2 md:justify-center md:gap-12 md:px-8">
        {SECTIONS.map((s) => (
          <Link
            key={s.key}
            href={s.key === "all" ? "/" : `/?section=${s.key}`}
            className={`flex shrink-0 items-center whitespace-nowrap text-sm font-medium tracking-widest transition-colors ${
              active === s.key ? "text-gray-900" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
