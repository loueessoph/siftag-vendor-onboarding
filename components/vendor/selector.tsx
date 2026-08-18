"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Input, Muted } from "@/components/ui";
import { MINIMUM_NATURAL_PCT, readComposition } from "@/lib/fibre";
import { plural } from "@/lib/format";
import {
  summarise,
  type SelectorProduct,
  type SelectorVariant,
} from "@/lib/selection";

type SaveState = "idle" | "saving" | "saved" | "error";

/** Asks Shopify's CDN for a thumbnail rather than the full-size original. */
function thumb(url: string, width: number): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("width", String(width));
    return parsed.toString();
  } catch {
    return url;
  }
}

export function Selector({
  token,
  initialProducts,
  locked,
}: {
  token: string;
  initialProducts: SelectorProduct[];
  locked: boolean;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState("");
  const [save, setSave] = useState<SaveState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // One timer per field, so typing in a composition box doesn't cancel the
  // pending save of a quantity somewhere else on the page.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const push = useCallback(
    (key: string, body: Record<string, unknown>, delay: number) => {
      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing);
      setSave("saving");
      timers.current.set(
        key,
        setTimeout(async () => {
          try {
            const res = await fetch("/api/vendor/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, ...body }),
            });
            setSave(res.ok ? "saved" : "error");
          } catch {
            setSave("error");
          }
        }, delay)
      );
    },
    [token]
  );

  const patchProduct = useCallback(
    (id: string, patch: Partial<SelectorProduct>, save: Record<string, unknown>) => {
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
      );
      push(`p:${id}`, { productId: id, patch: save }, 600);
    },
    [push]
  );

  const patchVariant = useCallback(
    (
      productId: string,
      variantId: string,
      patch: Partial<SelectorVariant>,
      save: Record<string, unknown>,
      delay = 600
    ) => {
      setProducts((prev) =>
        prev.map((p) =>
          p.id !== productId
            ? p
            : {
                ...p,
                variants: p.variants.map((v) =>
                  v.id === variantId ? { ...v, ...patch } : v
                ),
              }
        )
      );
      push(`v:${variantId}`, { variantId, patch: save }, delay);
    },
    [push]
  );

  /** Ticking a product in selects every size, so quantities are all it needs. */
  const toggleProduct = useCallback(
    (product: SelectorProduct, on: boolean) => {
      for (const variant of product.variants) {
        patchVariant(
          product.id,
          variant.id,
          { selected: on },
          { selected: on },
          0
        );
      }
    },
    [patchVariant]
  );

  const summary = useMemo(() => summarise(products), [products]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      [p.title, p.colour, p.productType, p.variants[0]?.vendorSku]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [products, query]);

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/vendor/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit.");
      window.location.reload();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Could not submit."
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <SummaryBar
        summary={summary}
        save={save}
        locked={locked}
        submitting={submitting}
        onSubmit={submit}
      />

      {submitError && (
        <p className="mt-4 text-sm text-red-600">{submitError}</p>
      )}

      {!locked && (
        <div className="mt-8">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${products.length} products by name or colour`}
            aria-label="Search your catalogue"
          />
        </div>
      )}

      <div className="mt-8 space-y-px">
        {visible.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            locked={locked}
            onToggle={(on) => toggleProduct(product, on)}
            onProduct={patchProduct}
            onVariant={patchVariant}
          />
        ))}
      </div>

      {visible.length === 0 && (
        <p className="py-16 text-center text-sm text-neutral-500">
          Nothing matches “{query}”.
        </p>
      )}
    </div>
  );
}

/* Summary ------------------------------------------------------------------ */

function SummaryBar({
  summary,
  save,
  locked,
  submitting,
  onSubmit,
}: {
  summary: ReturnType<typeof summarise>;
  save: SaveState;
  locked: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  if (locked) {
    return (
      <div className="border border-neutral-200 p-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          Submitted
        </p>
        <p className="mt-2 text-[15px]">
          {plural(summary.selectedProducts, "item")} ·{" "}
          {plural(summary.totalUnits, "piece")}. Your list is fixed so we can
          print tags from it.
        </p>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-10 -mx-6 border-b border-neutral-200 bg-white/95 px-6 py-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[15px] font-medium">
            {summary.selectedProducts === 0
              ? "Nothing selected yet"
              : `${plural(summary.selectedProducts, "item")} selected · ${plural(
                  summary.totalUnits,
                  "piece"
                )}`}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {summary.issues.length > 0
              ? `${summary.issues.length} still need${
                  summary.issues.length === 1 ? "s" : ""
                } attention`
              : summary.selectedProducts > 0
              ? "Nothing missing: ready to submit"
              : "Tick what you're bringing. It saves as you go."}
            {save !== "idle" && (
              <span className="ml-2 text-neutral-400">
                {save === "saving"
                  ? "· saving…"
                  : save === "saved"
                  ? "· saved"
                  : "· couldn't save"}
              </span>
            )}
          </p>
        </div>

        <button
          onClick={onSubmit}
          disabled={!summary.canSubmit || submitting}
          className="bg-neutral-900 px-6 py-3 text-xs uppercase tracking-[0.2em] text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {submitting ? "Submitting…" : "Submit my list"}
        </button>
      </div>
    </div>
  );
}

/* One product -------------------------------------------------------------- */

function ProductRow({
  product,
  locked,
  onToggle,
  onProduct,
  onVariant,
}: {
  product: SelectorProduct;
  locked: boolean;
  onToggle: (on: boolean) => void;
  onProduct: (
    id: string,
    patch: Partial<SelectorProduct>,
    save: Record<string, unknown>
  ) => void;
  onVariant: (
    productId: string,
    variantId: string,
    patch: Partial<SelectorVariant>,
    save: Record<string, unknown>,
    delay?: number
  ) => void;
}) {
  const selected = product.variants.some((v) => v.selected);
  const reading = product.fibreComposition
    ? readComposition(product.fibreComposition)
    : null;

  const belowThreshold =
    product.naturalFibrePct != null &&
    product.naturalFibrePct < MINIMUM_NATURAL_PCT;

  return (
    <article
      className={`border p-5 transition-colors ${
        belowThreshold && selected
          ? "border-red-600"
          : selected
          ? "border-neutral-900"
          : "border-neutral-200"
      }`}
    >
      <div className="flex gap-5">
        <div className="h-24 w-20 shrink-0 overflow-hidden bg-neutral-100">
          {product.imageUrl && (
            // Shopify's CDN resizes on its own with ?width=, so these go
            // straight from their CDN. Routing 25 thumbnails through Next's
            // optimiser only adds a hop that can fail.
            <img
              src={thumb(product.imageUrl, 160)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[15px] font-medium">{product.title}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {[product.colour, product.productType]
                  .filter(Boolean)
                  .join(" · ") || ":"}
                {product.variants[0]?.onlinePrice != null &&
                  ` · £${product.variants[0].onlinePrice}`}
              </p>
            </div>

            {!locked && (
              <label className="flex shrink-0 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => onToggle(e.target.checked)}
                  className="h-4 w-4 accent-neutral-900"
                />
                <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                  Bringing
                </span>
              </label>
            )}
          </div>

          {selected && (
            <div className="mt-5 space-y-5">
              <FibreField
                product={product}
                reading={reading}
                locked={locked}
                onProduct={onProduct}
              />
              <SizeTable
                product={product}
                locked={locked}
                onVariant={onVariant}
              />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function FibreField({
  product,
  reading,
  locked,
  onProduct,
}: {
  product: SelectorProduct;
  reading: ReturnType<typeof readComposition> | null;
  locked: boolean;
  onProduct: (
    id: string,
    patch: Partial<SelectorProduct>,
    save: Record<string, unknown>
  ) => void;
}) {
  const pct = product.naturalFibrePct;
  const below = pct != null && pct < MINIMUM_NATURAL_PCT;

  return (
    <div>
      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
          Fibre composition
        </span>
        <input
          value={product.fibreComposition ?? ""}
          disabled={locked}
          onChange={(e) => {
            const text = e.target.value;
            // Read the percentage as they type, so the 90% rule bites here
            // rather than at submit — but never overwrite a figure they set
            // by hand with a parse of prose we didn't understand.
            const parsed = readComposition(text);
            onProduct(
              product.id,
              {
                fibreComposition: text,
                naturalFibrePct: parsed.naturalPct ?? product.naturalFibrePct,
              },
              {
                fibre_composition: text,
                natural_fibre_pct: parsed.naturalPct ?? product.naturalFibrePct,
              }
            );
          }}
          placeholder="100% organic cotton"
          className={`mt-1.5 w-full border bg-white px-3 py-2.5 text-[15px] placeholder:text-neutral-400 focus:outline-none disabled:bg-neutral-100 ${
            below
              ? "border-red-600 focus:border-red-600"
              : "border-neutral-300 focus:border-neutral-900"
          }`}
        />
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {pct != null && (
          <span className={below ? "text-red-600" : "text-neutral-500"}>
            Read as <strong className="font-medium">{pct}% natural</strong>
            {below &&
              `: the event needs at least ${MINIMUM_NATURAL_PCT}%, so this can't be sold`}
          </span>
        )}
        {pct == null && product.fibreComposition && (
          <span className="text-neutral-500">
            Couldn&apos;t read a percentage: add one, like “100% linen”.
          </span>
        )}
        {reading?.unknown.length ? (
          <span className="text-neutral-500">
            Didn&apos;t recognise: {reading.unknown.join(", ")}
          </span>
        ) : null}
        {reading?.incomplete && (
          <span className="text-neutral-500">
            These don&apos;t add up to 100%.
          </span>
        )}
      </div>
    </div>
  );
}

function SizeTable({
  product,
  locked,
  onVariant,
}: {
  product: SelectorProduct;
  locked: boolean;
  onVariant: (
    productId: string,
    variantId: string,
    patch: Partial<SelectorVariant>,
    save: Record<string, unknown>,
    delay?: number
  ) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-[1fr_5rem_6rem] gap-3 border-b border-neutral-200 pb-2">
        {["Size", "Qty", "Pop-up £"].map((h) => (
          <span
            key={h}
            className="text-[11px] uppercase tracking-[0.15em] text-neutral-500"
          >
            {h}
          </span>
        ))}
      </div>

      {product.variants.map((variant) => (
        <div
          key={variant.id}
          className="grid grid-cols-[1fr_5rem_6rem] items-center gap-3 border-b border-neutral-100 py-2"
        >
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={variant.selected}
              disabled={locked}
              onChange={(e) =>
                onVariant(
                  product.id,
                  variant.id,
                  { selected: e.target.checked },
                  { selected: e.target.checked },
                  0
                )
              }
              className="h-3.5 w-3.5 accent-neutral-900"
            />
            <span className={variant.selected ? "" : "text-neutral-400"}>
              {variant.size ?? "One size"}
            </span>
          </label>

          <input
            type="number"
            min={0}
            inputMode="numeric"
            disabled={locked || !variant.selected}
            value={variant.quantityDeclared ?? ""}
            onChange={(e) => {
              const n = e.target.value === "" ? null : Number(e.target.value);
              onVariant(
                product.id,
                variant.id,
                { quantityDeclared: n },
                { quantity_declared: n }
              );
            }}
            placeholder="0"
            className="w-full border border-neutral-300 px-2 py-1.5 text-sm focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-400"
          />

          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            disabled={locked || !variant.selected}
            value={variant.popupPrice ?? ""}
            onChange={(e) => {
              const n = e.target.value === "" ? null : Number(e.target.value);
              onVariant(
                product.id,
                variant.id,
                { popupPrice: n },
                { popup_price: n }
              );
            }}
            className="w-full border border-neutral-300 px-2 py-1.5 text-sm focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-400"
          />
        </div>
      ))}

      <div className="mt-2">
        <Muted>
          Prices start at your online price. Change them if your pop-up price
          differs.
        </Muted>
      </div>
    </div>
  );
}
