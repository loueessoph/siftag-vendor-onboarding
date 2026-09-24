"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CatalogueItem } from "@/lib/browse";

interface Props {
  initialProducts: CatalogueItem[];
  /** From the header's section links (?section=…). */
  section: Section;
}

const FABRIC_OPTIONS = ["Cotton", "Silk", "Linen", "Wool", "Cashmere", "Viscose", "Denim"];

type SortValue = "recommended" | "price-low" | "price-high";
const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
];

export type Section = "all" | "women" | "men" | "accessories";

const SUB_CATEGORIES: Record<Section, string[]> = {
  all: [],
  women: ["Tops", "Bottoms", "Dresses"],
  men: ["Tops", "Bottoms"],
  accessories: [],
};

function formatComposition(fibreComposition: string | null): string {
  return fibreComposition?.trim() ?? "";
}

export function ShopClient({ initialProducts, section }: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [subCategory, setSubCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [size, setSize] = useState("all");
  const [fabric, setFabric] = useState("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<SortValue>("recommended");
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // A new section from the header resets the sub-category chips.
  useEffect(() => {
    setSubCategory("all");
  }, [section]);

  useEffect(() => {
    if (!sortOpen) return;
    const handle = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [sortOpen]);

  // Keep availability fresh (holds expire, staff mark things sold) without a manual refresh.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/popup/products", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          setProducts(json.products ?? []);
        }
      } catch {
        // Stay on last-known data; next tick tries again.
      }
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  const brands = useMemo(() => [...new Set(products.map((p) => p.brandName))].sort(), [products]);
  const brandLogos = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) if (p.brandSlug && !map.has(p.brandName)) map.set(p.brandName, p.brandSlug);
    return map;
  }, [products]);
  const sizes = useMemo(
    () => [...new Set(products.flatMap((p) => p.sizes.map((s) => s.size).filter(Boolean)))].sort() as string[],
    [products]
  );

  const filtered = products.filter((p) => {
    if (section === "accessories") {
      if (p.category !== "Accessories") return false;
    } else if (section === "women" || section === "men") {
      if (p.gender !== section || p.category === "Accessories") return false;
      if (subCategory !== "all" && p.category !== subCategory) return false;
    }
    if (brand !== "all" && p.brandName !== brand) return false;
    if (size !== "all" && !p.sizes.some((s) => s.size === size)) return false;
    if (fabric !== "all" && !(p.fibreComposition ?? "").toLowerCase().includes(fabric.toLowerCase())) return false;
    if (maxPrice && (p.priceGbp == null || p.priceGbp > Number(maxPrice))) return false;
    return true;
  });

  // "Recommended" keeps the server's default order (style-priority) — only Price actually re-sorts here.
  if (sort === "price-low") {
    filtered.sort((a, b) => (a.priceGbp ?? Infinity) - (b.priceGbp ?? Infinity));
  } else if (sort === "price-high") {
    filtered.sort((a, b) => (b.priceGbp ?? -Infinity) - (a.priceGbp ?? -Infinity));
  }

  const activeFilterCount = [brand !== "all", size !== "all", fabric !== "all", !!maxPrice].filter(Boolean).length;

  function clearFilters() {
    setBrand("all");
    setSize("all");
    setFabric("all");
    setMaxPrice("");
  }

  return (
    <div>
      {/* The brands, as a row of logos. Tap one to see only that brand; tap again for everyone. */}
      <BrandCarousel brands={brands} logos={brandLogos} selected={brand} onSelect={(b) => setBrand(brand === b ? "all" : b)} />

      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white">
        {SUB_CATEGORIES[section].length > 0 && (
          <div className="flex gap-1 pt-1 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setSubCategory("all")}
              className={`shrink-0 px-2.5 py-1 text-[11px] uppercase tracking-wide ${
                subCategory === "all" ? "text-gray-900 underline" : "text-gray-400"
              }`}
            >
              All
            </button>
            {SUB_CATEGORIES[section].map((c) => (
              <button
                key={c}
                onClick={() => setSubCategory(c)}
                className={`shrink-0 px-2.5 py-1 text-[11px] uppercase tracking-wide ${
                  subCategory === c ? "text-gray-900 underline" : "text-gray-400"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Filter (left) / Sort By (right) */}
        <div className="flex items-center justify-between gap-2 py-3">
          <button
            onClick={() => setFilterOpen(true)}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs transition-colors ${
              activeFilterCount > 0 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Filter
            {activeFilterCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
          </button>

          <div ref={sortRef} className="relative shrink-0">
            <button
              onClick={() => setSortOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs bg-gray-100 text-gray-700"
            >
              Sort By
              <svg
                className={`w-3 h-3 transition-transform ${sortOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {sortOpen && (
              <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-40 min-w-[170px]">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setSort(opt.value);
                      setSortOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-gray-50 ${
                      opt.value === sort ? "text-gray-900 font-medium" : "text-gray-600"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="pb-2 text-xs text-gray-400">{filtered.length} of {products.length} items</p>
      </div>

      {/* Grid — image, brand, title, composition, price only */}
      <div className="grid grid-cols-2 gap-6 py-6 md:grid-cols-3 lg:grid-cols-4">
        {filtered.map((p) => (
          <Link key={p.productId} href={`/popup/product/${p.productId}`} className="group">
            <div className="relative mb-3 aspect-[3/4] overflow-hidden rounded-lg bg-gray-200">
              {p.imageUrls[0] ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.imageUrls[0]}
                    alt={p.title}
                    className={`h-full w-full object-cover object-top ${
                      p.imageUrls[1] ? "transition-opacity duration-300 group-hover:opacity-0" : ""
                    }`}
                  />
                  {/* Second photo (if the product has one) — fades in on hover, like siftag.com's shop grid */}
                  {p.imageUrls[1] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrls[1]}
                      alt={`${p.title} - alternate view`}
                      className="absolute inset-0 h-full w-full object-cover object-top opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    />
                  )}
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-gray-400">No photo</div>
              )}
            </div>
            <p className="mb-1 truncate text-xs uppercase tracking-widest text-gray-400">{p.brandName}</p>
            <h3 className="mb-1 truncate text-sm text-gray-900">{p.title}</h3>
            {p.fibreComposition && (
              <p className="mb-1 truncate text-xs text-gray-500">{formatComposition(p.fibreComposition)}</p>
            )}
            <p className="text-sm text-gray-900">{p.priceGbp != null ? `£${p.priceGbp.toFixed(2)}` : "—"}</p>
          </Link>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-sm text-gray-400 py-10">No items match those filters.</p>
        )}
      </div>

      {/* Filter side panel */}
      {filterOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFilterOpen(false)} />
          <div className="absolute top-0 right-0 bottom-0 w-[85vw] max-w-sm bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <span className="text-sm font-medium tracking-widest uppercase text-gray-900">Filter</span>
              <button onClick={() => setFilterOpen(false)} aria-label="Close">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Brand</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setBrand("all")}
                    className={`px-3 py-1 text-xs rounded-full border ${
                      brand === "all" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600"
                    }`}
                  >
                    All
                  </button>
                  {brands.map((b) => (
                    <button
                      key={b}
                      onClick={() => setBrand(brand === b ? "all" : b)}
                      className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap ${
                        brand === b ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Size</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSize("all")}
                    className={`px-3 py-1 text-xs rounded-full border ${
                      size === "all" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600"
                    }`}
                  >
                    All
                  </button>
                  {sizes.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSize(size === s ? "all" : s)}
                      className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap ${
                        size === s ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Material</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setFabric("all")}
                    className={`px-3 py-1 text-xs rounded-full border ${
                      fabric === "all" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600"
                    }`}
                  >
                    All
                  </button>
                  {FABRIC_OPTIONS.map((f) => (
                    <button
                      key={f}
                      onClick={() => setFabric(fabric === f ? "all" : f)}
                      className={`px-3 py-1 text-xs rounded-full border ${
                        fabric === f ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Max price (£)</p>
                <input
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  type="number"
                  placeholder="Any"
                  className="w-full border border-gray-200 rounded-full px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
                />
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-gray-200">
              <button
                onClick={clearFilters}
                className="flex-1 py-2.5 text-xs font-medium tracking-widest uppercase text-gray-900 border border-gray-300 rounded-full"
              >
                Clear
              </button>
              <button
                onClick={() => setFilterOpen(false)}
                className="flex-1 py-2.5 text-xs font-medium tracking-widest uppercase bg-gray-900 text-white rounded-full"
              >
                View {filtered.length}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A sideways-scrolling strip of the brands' own logos, siftag.com's
 * "shop by brand" idea for a pop-up with a dozen labels. Logos are the
 * files scripts/fetch-brand-logos.mjs pulled from each brand's site; a
 * brand without one shows its name set small.
 */
function BrandCarousel({
  brands,
  logos,
  selected,
  onSelect,
}: {
  brands: string[];
  logos: Map<string, string>;
  selected: string;
  onSelect: (brand: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const nudge = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  if (brands.length === 0) return null;
  return (
    <div className="relative -mx-4 border-b border-gray-100 md:-mx-6">
      <button
        type="button"
        aria-label="Scroll brands left"
        onClick={() => nudge(-1)}
        className="absolute left-0 top-0 z-10 hidden h-full w-14 items-center justify-start bg-gradient-to-r from-white via-white/90 to-transparent pl-3 md:flex"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow-sm transition-colors hover:border-gray-900 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" />
        </span>
      </button>
      <div ref={scroller} className="scrollbar-hide flex items-center gap-8 overflow-x-auto px-4 py-4 md:gap-12 md:px-16">
        {brands.map((b) => {
          const slug = logos.get(b);
          const active = selected === b;
          const muted = selected !== "all" && !active;
          return (
            <button
              key={b}
              type="button"
              onClick={() => onSelect(b)}
              aria-pressed={active}
              title={b}
              className={`flex h-12 shrink-0 items-center border-b-2 pb-1 transition-all ${
                active ? "border-gray-900 opacity-100" : "border-transparent opacity-80 hover:opacity-100"
              } ${muted ? "opacity-40" : ""}`}
            >
              {slug ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/brand-logos/${slug}.png`} alt={b} className="max-h-8 w-auto max-w-[8rem] object-contain md:max-h-9" />
              ) : (
                <span className="whitespace-nowrap text-[11px] font-medium tracking-widest text-gray-700">{b.toUpperCase()}</span>
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="Scroll brands right"
        onClick={() => nudge(1)}
        className="absolute right-0 top-0 z-10 hidden h-full w-14 items-center justify-end bg-gradient-to-l from-white via-white/90 to-transparent pr-3 md:flex"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow-sm transition-colors hover:border-gray-900 hover:text-gray-900">
          <ChevronRight className="h-4 w-4" />
        </span>
      </button>
    </div>
  );
}
