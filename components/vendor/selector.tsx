"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Field, Input, Muted, Pill, Select, TextButton, Textarea } from "@/components/ui";
import { CompositionEditor } from "@/components/vendor/composition-editor";
import { MINIMUM_NATURAL_PCT, joinNotes, readComposition, splitNotes } from "@/lib/fibre";
import { money, plural } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import {
  compareSizes,
  summarise,
  type SelectorProduct,
  type SelectorVariant,
} from "@/lib/selection";

type SaveState = "idle" | "saving" | "saved" | "error";
type SortMode = "selected" | "az" | "price-asc" | "price-desc";
type ShowMode = "all" | "selected" | "unselected";

function priceOf(p: SelectorProduct): number {
  const v = p.variants[0];
  return v?.popupPrice ?? v?.onlinePrice ?? Number.POSITIVE_INFINITY;
}

/** Product ids in the chosen order. "Bringing first" keeps A to Z within each group. */
function sortedIds(products: SelectorProduct[], mode: SortMode): string[] {
  const byTitle = (a: SelectorProduct, b: SelectorProduct) =>
    a.title.localeCompare(b.title);
  const sorted = [...products].sort((a, b) => {
    switch (mode) {
      case "selected": {
        const sa = a.variants.some((v) => v.selected) ? 0 : 1;
        const sb = b.variants.some((v) => v.selected) ? 0 : 1;
        return sa - sb || byTitle(a, b);
      }
      case "price-asc":
        return priceOf(a) - priceOf(b) || byTitle(a, b);
      case "price-desc":
        return priceOf(b) - priceOf(a) || byTitle(a, b);
      default:
        return byTitle(a, b);
    }
  });
  return sorted.map((p) => p.id);
}

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
  deadline,
  submittedAt,
  changedSinceSubmit,
}: {
  token: string;
  initialProducts: SelectorProduct[];
  /** True once the deadline has passed: everything read-only. */
  locked: boolean;
  /** ISO date of the product list deadline. */
  deadline: string;
  /** When they last pressed submit, if ever. */
  submittedAt: string | null;
  /** Edits saved since that submit, so the snapshot is behind. */
  changedSinceSubmit: boolean;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("selected");
  const [show, setShow] = useState<ShowMode>("all");
  // The order is fixed when the page loads or the sort changes, never while
  // they tick things: a card that jumps away as you tick it is unusable.
  const [order, setOrder] = useState<string[]>(() =>
    sortedIds(initialProducts, "selected")
  );
  const [save, setSave] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [changed, setChanged] = useState(changedSinceSubmit);
  // After a submit the list is shown as what was sent, not as a form, so
  // "sent" and "editing" look different. "Make changes" reopens the form.
  const [editing, setEditing] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Set when they press submit with things missing: the list of what, shown
  // where the button is, rather than a dead grey button they can't ask why.
  const [showIssues, setShowIssues] = useState(false);

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
            if (res.ok) {
              setSave("saved");
              setSavedAt(new Date());
              setChanged(true);
            } else {
              setSave("error");
            }
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
      // A photo upload has already been saved by its own request.
      if (Object.keys(save).length === 0) return;
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

  const addVariant = useCallback(
    (productId: string, variant: SelectorVariant) => {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, variants: [...p.variants, variant] } : p
        )
      );
      setChanged(true);
    },
    []
  );

  const removeVariant = useCallback(
    async (productId: string, variantId: string) => {
      setRemoveError(null);
      // Optimistic: the row goes at once and comes back only if the server
      // says no. Waiting for the round trip made the × look dead.
      let removed: SelectorVariant | undefined;
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== productId) return p;
          removed = p.variants.find((v) => v.id === variantId);
          return { ...p, variants: p.variants.filter((v) => v.id !== variantId) };
        })
      );
      setSave("saving");
      try {
        const res = await fetch("/api/vendor/items/sizes", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, variantId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Could not remove that size.");
        }
        setSave("saved");
        setSavedAt(new Date());
        setChanged(true);
      } catch (e) {
        setSave("error");
        setRemoveError(e instanceof Error ? e.message : "Could not remove that size.");
        if (removed) {
          const back = removed;
          setProducts((prev) =>
            prev.map((p) =>
              p.id === productId ? { ...p, variants: [...p.variants, back] } : p
            )
          );
        }
      }
    },
    [token]
  );

  const untickAll = useCallback(() => {
    for (const product of products) {
      if (product.variants.some((v) => v.selected)) toggleProduct(product, false);
    }
  }, [products, toggleProduct]);

  const removeCustom = useCallback(
    async (product: SelectorProduct) => {
      setRemoveError(null);
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      setSave("saving");
      try {
        const res = await fetch("/api/vendor/items", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, productId: product.id }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Could not remove that item.");
        }
        setSave("saved");
        setSavedAt(new Date());
        setChanged(true);
      } catch (e) {
        setSave("error");
        setRemoveError(e instanceof Error ? e.message : "Could not remove that item.");
        setProducts((prev) => [...prev, product]);
      }
    },
    [token]
  );

  const summary = useMemo(() => summarise(products), [products]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...products]
      .filter((p) => {
        const picked = p.variants.some((v) => v.selected);
        if (show === "selected" && !picked) return false;
        if (show === "unselected" && picked) return false;
        if (!q) return true;
        return [p.title, p.colour, p.productType, p.variants[0]?.vendorSku]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q));
      })
      // Anything not in the frozen order (an item added just now) goes last.
      .sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  }, [products, query, order, show]);

  const changeSort = (mode: SortMode) => {
    setSort(mode);
    setOrder(sortedIds(products, mode));
  };

  async function submit() {
    setSubmitError(null);
    if (!summary.canSubmit) {
      setShowIssues(true);
      return;
    }
    setShowIssues(false);
    setSubmitting(true);
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

  const sentView = locked || (submittedAt != null && !changed && !editing);

  return (
    <div>
      <SummaryBar
        summary={summary}
        save={save}
        savedAt={savedAt}
        locked={locked}
        deadline={deadline}
        submittedAt={submittedAt}
        changed={changed}
        editing={editing}
        submitting={submitting}
        onSubmit={submit}
        onEdit={() => setEditing(true)}
        onCancelEdit={() => setEditing(false)}
      />

      {submitError && (
        <p className="mt-4 text-sm text-red-600">{submitError}</p>
      )}

      {showIssues && !summary.canSubmit && (
        <div className="mt-4 border border-red-600 p-5">
          <p className="text-sm font-medium text-red-600">
            {summary.selectedProducts === 0
              ? "Choose at least one item you're bringing first."
              : "Before we can review your list, these need finishing:"}
          </p>
          {summary.issues.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {summary.issues.map((issue, i) => (
                <li key={`${issue.productId}-${i}`}>
                  <span className="font-medium">{issue.title}</span>
                  <span className="text-neutral-500">: {issue.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Not blockers: sizes that will be left out because they have no
          quantity. Shown quietly, always, so nobody is surprised later. */}
      {!sentView && summary.warnings.length > 0 && (
        <div className="mt-4 border border-amber-500 bg-amber-50 p-5">
          <p className="text-sm font-medium text-amber-800">
            Worth a look before you submit:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-800">
            {summary.warnings.map((w, i) => (
              <li key={`${w.productId}-${i}`}>
                <span className="font-medium text-neutral-900">{w.title}</span>
                {" · "}
                {w.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sentView ? (
        <div className="mt-8 space-y-4">
          {products
            .filter((p) => p.variants.some((v) => v.selected))
            .map((product) => (
              <SentCard key={product.id} product={product} />
            ))}
        </div>
      ) : (
        <>
          {!locked && (
            <SelectionPanel
              products={products}
              onUntick={(product) => toggleProduct(product, false)}
              onUntickAll={untickAll}
            />
          )}

          {removeError && (
            <p className="mt-4 text-sm text-red-600">{removeError}</p>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${products.length} products by name or colour`}
                aria-label="Search your catalogue"
              />
            </div>
            <label className="block sm:w-44">
              <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                Filter by
              </span>
              <div className="mt-1.5">
                <Select
                  value={show}
                  onChange={(e) => setShow(e.target.value as ShowMode)}
                >
                  <option value="all">Everything</option>
                  <option value="selected">Bringing</option>
                  <option value="unselected">Not bringing</option>
                </Select>
              </div>
            </label>
            <label className="block sm:w-52">
              <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                Sort by
              </span>
              <div className="mt-1.5">
                {/* "Bringing first" only means something when both groups
                    are on screen. Under a filter it is plain A to Z. */}
                <Select
                  value={show === "all" ? sort : sort === "selected" ? "az" : sort}
                  onChange={(e) => changeSort(e.target.value as SortMode)}
                >
                  {show === "all" && (
                    <option value="selected">Bringing first</option>
                  )}
                  <option value="az">A to Z</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                </Select>
              </div>
            </label>
          </div>

          <div className="mt-8 space-y-4">
            {visible.map((product) => (
              <ProductRow
                key={product.id}
                token={token}
                product={product}
                locked={locked}
                onVariantAdded={addVariant}
                onVariantRemoved={removeVariant}
                onToggle={(on) => toggleProduct(product, on)}
                onProduct={patchProduct}
                onVariant={patchVariant}
                onRemove={product.custom ? () => removeCustom(product) : undefined}
              />
            ))}
          </div>

          {visible.length === 0 && (
            <p className="py-16 text-center text-sm text-neutral-500">
              {query.trim()
                ? `Nothing matches “${query.trim()}”${
                    show !== "all" ? " in this filter" : ""
                  }.`
                : show === "selected"
                ? "You haven't chosen anything to bring yet."
                : show === "unselected"
                ? "Everything is on your list. Nothing left out."
                : "No products yet."}
            </p>
          )}

          {!locked && <AddItemForm token={token} />}
        </>
      )}
    </div>
  );
}

/* Summary ------------------------------------------------------------------ */

function SummaryBar({
  summary,
  save,
  savedAt,
  locked,
  deadline,
  submittedAt,
  changed,
  editing,
  submitting,
  onSubmit,
  onEdit,
  onCancelEdit,
}: {
  summary: ReturnType<typeof summarise>;
  save: SaveState;
  savedAt: Date | null;
  locked: boolean;
  deadline: string;
  submittedAt: string | null;
  changed: boolean;
  editing: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
}) {
  const submitted = submittedAt != null;
  const submittedOn = submittedAt ? formatDate(submittedAt.slice(0, 10)) : "";

  if (locked) {
    return (
      <div className="border border-neutral-200 p-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          {submitted ? "Submitted" : "Closed"}
        </p>
        <p className="mt-2 text-[15px]">
          {submitted
            ? `${plural(summary.selectedProducts, "item")} · ${plural(
                summary.totalUnits,
                "piece"
              )}, submitted ${submittedOn}. The deadline has passed, so your list is fixed and we're printing tags from it.`
            : `The product list deadline was ${formatDate(
                deadline
              )}. Email us and we'll sort something out.`}
          {submitted && changed && (
            <>
              {" "}
              Changes you made after submitting weren&apos;t submitted, so the
              submitted list stands. Email us if that&apos;s a problem.
            </>
          )}
        </p>
      </div>
    );
  }

  // What the button does depends on where they are: a first submit, an
  // update after edits, or nothing to do because the snapshot is current.
  const upToDate = submitted && !changed;
  const headline =
    summary.selectedProducts === 0
      ? "Nothing selected yet"
      : `${plural(summary.selectedProducts, "item")} selected · ${plural(
          summary.totalUnits,
          "piece"
        )}`;

  // Sent and unchanged: the list reads as a receipt, with one way back in.
  if (upToDate && !editing) {
    return (
      <div className="sticky top-0 z-10 -mx-6 border-b border-neutral-200 bg-white/95 px-6 py-4 backdrop-blur-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <Pill tone="done">Sent to Siftag</Pill>
              <p className="text-[15px] font-medium">{headline}</p>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Submitted {submittedOn}. This is what we&apos;re reviewing. You
              can still change it until {formatDate(deadline)}.
            </p>
          </div>
          <div className="shrink-0">
            <Button size="compact" variant="secondary" onClick={onEdit}>
              Make changes
            </Button>
          </div>
        </div>
      </div>
    );
  }
  const situation =
    summary.issues.length > 0
      ? `${summary.issues.length} still need${
          summary.issues.length === 1 ? "s" : ""
        } attention`
      : upToDate
      ? `Submitted ${submittedOn}. You can still change it until ${formatDate(
          deadline
        )}.`
      : submitted
      ? `Changed since you submitted ${submittedOn}: press Update for approval so we review the right list.`
      : summary.selectedProducts > 0
      ? "Nothing missing: ready to submit for approval"
      : "Choose what you're bringing.";

  return (
    <div className="sticky top-0 z-10 -mx-6 border-b border-neutral-200 bg-white/95 px-6 py-4 backdrop-blur-sm">
      {/* Two groups with air between them: what's on the list and whether
          it's saved on the left; the one thing to press, with the reason,
          on the right. */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
        <div className="min-w-0">
          <p className="text-[15px] font-medium">{headline}</p>
          <p className="mt-1 text-xs text-neutral-500">{situation}</p>
          <div className="mt-3">
            <SaveStatus state={save} at={savedAt} />
          </div>
        </div>

        <div className="shrink-0 sm:max-w-xs sm:text-right">
          {upToDate ? (
            // Reopened the form but changed nothing yet: the only sensible
            // action is to go back; the update button appears on first edit.
            <>
              <Button size="compact" variant="secondary" onClick={onCancelEdit}>
                Back to what you sent
              </Button>
              <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                Nothing changed yet.
              </p>
            </>
          ) : (
            <Button size="compact" onClick={onSubmit} disabled={submitting}>
              {submitting
                ? "Submitting…"
                : submitted
                ? "Update for approval"
                : "Submit for approval"}
            </Button>
          )}
          {/* Saving is not submitting. Said in red because a brand who typed
              everything in and left, thinking it was done, is the failure
              that costs them their place. */}
          {!upToDate && (
            <p className="mt-2 text-xs leading-relaxed text-red-600">
              Saved changes aren&apos;t sent to Siftag until you press{" "}
              {submitted ? "Update for approval" : "Submit for approval"}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The autosave signal. Always visible while editing so a brand never has to
 * wonder whether the quantity they just typed made it: idle says it will,
 * saving says it's happening, saved says when, and an error says so in red
 * rather than looking like success.
 */
function SaveStatus({ state, at }: { state: SaveState; at: Date | null }) {
  const time = at
    ? at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;
  const tone =
    state === "error"
      ? "text-red-600"
      : state === "saved"
      ? "text-neutral-900"
      : "text-neutral-500";
  const dot =
    state === "saving"
      ? "animate-pulse bg-neutral-400"
      : state === "saved"
      ? "bg-neutral-900"
      : state === "error"
      ? "bg-red-600"
      : "bg-neutral-300";
  const label =
    state === "saving"
      ? "Saving…"
      : state === "saved"
      ? `All changes saved${time ? ` at ${time}` : ""}`
      : state === "error"
      ? "Couldn't save your last change. Check your connection and try again."
      : "Saves automatically as you go";

  return (
    <p
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 text-xs ${tone}`}
    >
      <span className={`inline-block h-1.5 w-1.5 ${dot}`} />
      {label}
    </p>
  );
}

/** The item's name, linking to its page on the brand's site when there is one. */
function ProductTitle({ product }: { product: { title: string; url: string | null } }) {
  if (!product.url) return <>{product.title}</>;
  return (
    <a
      href={product.url}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-neutral-300 underline-offset-4 transition-colors hover:decoration-neutral-900"
    >
      {product.title}
    </a>
  );
}

/* What was sent ------------------------------------------------------------- */

/**
 * A selected item as it stands after submit: photo, composition, the size
 * run as a table, and our decision if we've made one. Deliberately not a
 * form, so a brand can tell at a glance whether they're looking at what
 * they sent or editing it.
 */
function SentCard({ product }: { product: SelectorProduct }) {
  const chosen = [...product.variants]
    .filter((v) => v.selected && (v.quantityDeclared ?? 0) > 0)
    .sort(
      (a, b) =>
        (a.colour ?? "").localeCompare(b.colour ?? "") || compareSizes(a.size, b.size)
    );
  const multiColour = new Set(chosen.map((v) => v.colour).filter(Boolean)).size > 1;
  const units = chosen.reduce((n, v) => n + (v.quantityDeclared ?? 0), 0);
  const decided = product.approvalStatus !== "pending";
  const approved = product.approvalStatus === "approved";

  return (
    <article
      className={`border p-5 ${
        decided && !approved ? "border-red-600" : "border-neutral-200"
      }`}
    >
      <div className="flex items-start gap-6">
        <div className="w-32 shrink-0 bg-neutral-100 sm:w-2/5 sm:max-w-md">
          {product.imageUrl && (
            <img
              src={product.imageUrl}
              alt=""
              loading="lazy"
              className="block h-auto w-full"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-medium">
                <ProductTitle product={product} />
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {[product.colour, plural(units, "piece")].filter(Boolean).join(" · ")}
              </p>
              {product.approvalNote && (
                <p className="mt-2 text-sm leading-relaxed">
                  <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                    Notes from Siftag
                  </span>
                  <span className={`block mt-0.5 ${approved ? "" : "text-red-600"}`}>
                    {product.approvalNote}
                  </span>
                </p>
              )}
            </div>
            <Pill tone={decided ? (approved ? "done" : "error") : "neutral"}>
              {decided
                ? approved
                  ? "Approved by Siftag"
                  : "Not approved"
                : "Awaiting review"}
            </Pill>
          </div>

          <div className="mt-4 text-sm">
            <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
              Fibre composition
            </p>
            <p className="mt-1">
              {product.fibreComposition ??
                (splitNotes(product.notes).fabric ? "As on your website, below" : "Not given")}
            </p>
          </div>

          {(() => {
            const { fabric, own } = splitNotes(product.notes);
            return (
              <>
                {fabric && (
                  <div className="mt-4 text-sm">
                    <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                      Fabric content from your website
                    </p>
                    <p className="mt-1 text-neutral-600">{fabric}</p>
                  </div>
                )}
                {own.trim() && (
                  <div className="mt-4 text-sm">
                    <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                      Your notes
                    </p>
                    <p className="mt-1 leading-relaxed">{own}</p>
                  </div>
                )}
              </>
            );
          })()}

          <table className="mt-4 w-full max-w-md text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                <th className="pb-2 text-left font-normal">Size</th>
                <th className="pb-2 text-right font-normal">Qty</th>
                <th className="pb-2 text-right font-normal">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 border-y border-neutral-200">
              {chosen.map((v) => (
                <tr key={v.id}>
                  <td className="py-2">
                    {v.size ?? "One size"}
                    {multiColour && v.colour && (
                      <span className="ml-2 text-neutral-500">{v.colour}</span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">{v.quantityDeclared ?? 0}</td>
                  <td className="py-2 text-right tabular-nums">{money(v.popupPrice)}</td>
                </tr>
              ))}
            </tbody>
            {chosen.length > 1 && (
              <tfoot>
                <tr className="text-neutral-500">
                  <td className="pt-2">Total</td>
                  <td className="pt-2 text-right tabular-nums">{units}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </article>
  );
}

/* One product -------------------------------------------------------------- */

function ProductRow({
  token,
  product,
  locked,
  onToggle,
  onProduct,
  onVariant,
  onRemove,
  onVariantAdded,
  onVariantRemoved,
}: {
  token: string;
  product: SelectorProduct;
  locked: boolean;
  onVariantAdded: (productId: string, variant: SelectorVariant) => void;
  onVariantRemoved: (productId: string, variantId: string) => void;
  onToggle: (on: boolean) => void;
  /** Present only for items the brand added by hand. */
  onRemove?: () => void;
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
        belowThreshold && selected ? "border-red-600" : "border-neutral-200"
      }`}
    >
      <div className="flex items-start gap-5">
        <div className="w-32 shrink-0 sm:w-2/5 sm:max-w-md">
          {product.imageUrl ? (
            // Shopify's CDN resizes on its own with ?width=, so these go
            // straight from their CDN. Routing 25 thumbnails through Next's
            // optimiser only adds a hop that can fail.
            <img
              src={thumb(product.imageUrl, 640)}
              alt=""
              loading="lazy"
              className="block h-auto w-full"
            />
          ) : (
            <PhotoUpload
              token={token}
              productId={product.id}
              locked={locked}
              onUploaded={(url) =>
                onProduct(product.id, { imageUrl: url }, {})
              }
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-medium">
                <ProductTitle product={product} />
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {[
                  product.colour,
                  product.productType,
                  product.variants[0]?.onlinePrice != null
                    ? money(product.variants[0].onlinePrice)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {selected && product.approvalNote && (
                <p className="mt-2 text-sm leading-relaxed">
                  <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                    Notes from Siftag
                  </span>
                  <span
                    className={`block mt-0.5 ${
                      product.approvalStatus === "rejected"
                        ? "text-red-600"
                        : "text-neutral-900"
                    }`}
                  >
                    {product.approvalNote}
                  </span>
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {selected && product.approvalStatus !== "pending" && (
                <Pill
                  tone={product.approvalStatus === "approved" ? "done" : "error"}
                >
                  {product.approvalStatus === "approved"
                    ? "Approved by Siftag"
                    : "Not approved"}
                </Pill>
              )}
              {!locked && (
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => onToggle(e.target.checked)}
                    className="checkbox"
                  />
                  <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                    Bringing
                  </span>
                </label>
              )}
            </div>
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
                token={token}
                product={product}
                locked={locked}
                onVariant={onVariant}
                onVariantAdded={onVariantAdded}
                onVariantRemoved={onVariantRemoved}
              />
              <NotesField
                product={product}
                locked={locked}
                onProduct={onProduct}
              />
            </div>
          )}

          {onRemove && !locked && (
            <div className="mt-4 flex items-center gap-3">
              <Pill>Added by you</Pill>
              <TextButton tone="danger" onClick={onRemove}>
                Remove this item
              </TextButton>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * The brand's own note on an item: care, sizing, "sample only", anything
 * the tag or the till should know. Free text, autosaved like the rest.
 */
function NotesField({
  product,
  locked,
  onProduct,
}: {
  product: SelectorProduct;
  locked: boolean;
  onProduct: (
    id: string,
    patch: Partial<SelectorProduct>,
    save: Record<string, unknown>
  ) => void;
}) {
  const { fabric, own } = splitNotes(product.notes);
  const [open, setOpen] = useState(false);
  if (!own.trim() && !open) {
    return locked ? null : (
      <div>
        <TextButton onClick={() => setOpen(true)}>Add a note for Siftag</TextButton>
      </div>
    );
  }
  return (
    <div>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-900">
          Notes for Siftag
        </span>
        <Textarea
          rows={2}
          value={own}
          disabled={locked}
          autoFocus={open && !own.trim()}
          placeholder="Care, sizing, anything we should know about this item."
          className="mt-1.5"
          onChange={(e) => {
            const notes = joinNotes(fabric, e.target.value);
            onProduct(product.id, { notes }, { care_notes: notes });
          }}
        />
      </label>
    </div>
  );
}

/* Money ---------------------------------------------------------------------- */

/**
 * A price box that shows two decimals. Free typing while focused; on blur
 * the value is rounded to the penny, shown as "115.90", and saved. Cheaper
 * than a number input, which shows "115.9" and steps by arrows nobody wants.
 */
function PriceInput({
  value,
  disabled,
  onCommit,
}: {
  value: number | null;
  disabled: boolean;
  onCommit: (n: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? "" : value.toFixed(2));
  const [focused, setFocused] = useState(false);
  // Keep in step with outside changes (a bulk reset, a reload) when not typing.
  useEffect(() => {
    if (!focused) setText(value == null ? "" : value.toFixed(2));
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))}
      onBlur={() => {
        setFocused(false);
        const n = text.trim() === "" ? null : Math.round(Number(text) * 100) / 100;
        const clean = n == null || !Number.isFinite(n) ? null : n;
        setText(clean == null ? "" : clean.toFixed(2));
        if (clean !== value) onCommit(clean);
      }}
      className="w-full border border-neutral-300 px-2 py-1.5 text-right text-sm tabular-nums focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-400"
    />
  );
}

/* Colour swatches ---------------------------------------------------------- */

// Named colours as brands write them. A colour we can't place gets a neutral
// hatched square rather than a wrong one; the name is still right there.
const SWATCHES: [RegExp, string][] = [
  [/\b(black|nero|ink|charcoal)\b/i, "#1a1a1a"],
  [/\b(white|ivory|ecru|cream|off.?white|natural|undyed|oatmeal|bone)\b/i, "#f3efe6"],
  [/\b(beige|sand|stone|camel|tan|khaki|taupe)\b/i, "#c9b79c"],
  [/\b(navy|ink blue|midnight)\b/i, "#1f2a44"],
  [/\b(light blue|sky|sky blue|pale blue|powder)\b/i, "#a9c6e8"],
  [/\b(blue|denim|cobalt|indigo)\b/i, "#3b5b9a"],
  [/\b(dark grey|dark gray|slate|graphite)\b/i, "#5a5a5a"],
  [/\b(light grey|light gray|silver|ash)\b/i, "#c9c9c9"],
  [/\b(grey|gray)\b/i, "#8a8a8a"],
  [/\b(khaki green|olive|army|moss)\b/i, "#6b6b3a"],
  [/\b(sage|mint|pistachio)\b/i, "#a7c4a0"],
  [/\b(green|forest|emerald)\b/i, "#3f6b45"],
  [/\b(red|cherry|scarlet|crimson)\b/i, "#b3261e"],
  [/\b(burgundy|wine|maroon|bordeaux|oxblood)\b/i, "#6b1f2a"],
  [/\b(pink|blush|rose|soft blush)\b/i, "#e8b4bc"],
  [/\b(nude|peach|apricot)\b/i, "#e2b8a0"],
  [/\b(coral|salmon)\b/i, "#e8846b"],
  [/\b(orange|tangerine|rust|terracotta)\b/i, "#c8642a"],
  [/\b(yellow|butter|mustard|lemon|ochre)\b/i, "#e5c04b"],
  [/\b(purple|plum|aubergine|mauve|violet)\b/i, "#6a4c93"],
  [/\b(lilac|lavender)\b/i, "#c3b1e1"],
  [/\b(brown|chocolate|mocha|espresso|cocoa|tobacco)\b/i, "#5c4033"],
  [/\b(turquoise|teal|aqua)\b/i, "#3aa6a6"],
  [/\b(gold)\b/i, "#c9a227"],
];

function swatchFor(colour: string | null): string | null {
  if (!colour) return null;
  for (const [re, hex] of SWATCHES) if (re.test(colour)) return hex;
  return null;
}

function Swatch({ colour }: { colour: string | null }) {
  const hex = swatchFor(colour);
  return (
    <span
      aria-hidden="true"
      className="inline-block h-7 w-7 shrink-0 border border-neutral-300"
      style={
        hex
          ? { backgroundColor: hex }
          : {
              backgroundImage:
                "repeating-linear-gradient(45deg, #e5e5e5 0 3px, #ffffff 3px 6px)",
            }
      }
    />
  );
}

/* Selection panel ---------------------------------------------------------- */

/**
 * Everything ticked, in one place, so a brand can check their list without
 * scrolling through the whole catalogue, and untick from here. Collapsed by
 * default so it doesn't push the catalogue down the page.
 */
function SelectionPanel({
  products,
  onUntick,
  onUntickAll,
}: {
  products: SelectorProduct[];
  onUntick: (product: SelectorProduct) => void;
  onUntickAll: () => void;
}) {
  const chosen = products.filter((p) => p.variants.some((v) => v.selected));
  if (chosen.length === 0) return null;

  return (
    <details className="group mt-6 border border-neutral-900">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-neutral-900 px-5 py-4 text-xs uppercase tracking-[0.2em] text-white transition-colors hover:bg-neutral-700 [&::-webkit-details-marker]:hidden">
        <span>Your selection · {plural(chosen.length, "item")}</span>
        <span aria-hidden="true" className="text-base leading-none">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">−</span>
        </span>
      </summary>
      <div className="px-5 pb-5">
        <ul className="divide-y divide-neutral-200">
          {chosen.map((product) => {
            const units = product.variants
              .filter((v) => v.selected)
              .reduce((n, v) => n + (v.quantityDeclared ?? 0), 0);
            return (
              <li
                key={product.id}
                className="flex items-center justify-between gap-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium">{product.title}</span>
                  <span className="text-neutral-500">
                    {product.colour ? ` · ${product.colour}` : ""} ·{" "}
                    {plural(units, "piece")}
                  </span>
                </span>
                <TextButton onClick={() => onUntick(product)}>Not bringing</TextButton>
              </li>
            );
          })}
        </ul>
        <div className="mt-4">
          <TextButton tone="danger" onClick={onUntickAll}>
            Remove everything from my list
          </TextButton>
        </div>
      </div>
    </details>
  );
}

/* Add an item -------------------------------------------------------------- */

/**
 * For anything that isn't on the website: a sample, a one-off, a piece that
 * hasn't launched. Creates a real product with till codes, ticked, so the
 * rest of the form treats it like everything else. The page reloads on
 * success because the server assigns the ids and codes.
 */
function AddItemForm({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    colour: "",
    sizes: "",
    price: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);

  if (!open) {
    return (
      <div className="mt-8 border border-dashed border-neutral-300 px-6 py-8 text-center">
        <p className="text-sm text-neutral-500">
          Bringing something that isn&apos;t on your website?
        </p>
        <div className="mt-4">
          <Button size="small" variant="secondary" onClick={() => setOpen(true)}>
            Add an item
          </Button>
        </div>
      </div>
    );
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/vendor/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add that item.");
      if (photo) {
        const body = new FormData();
        body.set("token", token);
        body.set("productId", data.productId);
        body.set("photo", photo);
        const up = await fetch("/api/vendor/photo", { method: "POST", body });
        if (!up.ok) {
          // The item exists; the photo can be added from its card.
          const problem = await up.json().catch(() => ({}));
          console.warn("photo upload failed", problem);
        }
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that item.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 border border-neutral-900 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[15px] font-medium">Add an item</p>
        <TextButton onClick={() => setOpen(false)}>Cancel</TextButton>
      </div>
      <div className="mt-2">
        <Muted>
          It gets a till code and appears in your list as bringing. Add the fibre
          composition and quantities there once it&apos;s in.
        </Muted>
      </div>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Item name">
            <Input value={form.title} onChange={set("title")} required placeholder="Clenston Dress" />
          </Field>
        </div>
        <Field label="Colour" hint="Optional.">
          <Input value={form.colour} onChange={set("colour")} placeholder="Dark grey" />
        </Field>
        <Field label="Sizes" hint="Separate with commas. Leave blank for one size.">
          <Input value={form.sizes} onChange={set("sizes")} placeholder="XS, S, M, L" />
        </Field>
        <Field label="Pop-up price (£)" hint="You can change it per size afterwards.">
          <Input value={form.price} onChange={set("price")} inputMode="decimal" placeholder="120" />
        </Field>
        <Field label="Photo" hint="Optional. JPG, PNG or WebP, up to 8 MB.">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-neutral-700 file:mr-3 file:border file:border-neutral-900 file:bg-white file:px-4 file:py-2 file:text-[11px] file:uppercase file:tracking-[0.15em] file:text-neutral-900 hover:file:bg-neutral-100"
          />
        </Field>
      </div>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <div className="mt-6">
        <Button size="compact" type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add to my list"}
        </Button>
      </div>
    </form>
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
  const fabric = splitNotes(product.notes).fabric;
  // With the website's statement in hand the editor is a correction tool,
  // so it stays out of the way until asked for.
  const [correcting, setCorrecting] = useState(false);
  const showEditor = !fabric || correcting || !!product.fibreComposition;

  const onText = useCallback(
    (text: string) => {
      // Read the percentage as they choose, so the 90% rule bites here rather
      // than at submit. An empty composition clears the figure with it.
      const parsed = readComposition(text);
      const pct = text ? parsed.naturalPct ?? product.naturalFibrePct : null;
      onProduct(
        product.id,
        { fibreComposition: text, naturalFibrePct: pct },
        { fibre_composition: text, natural_fibre_pct: pct }
      );
    },
    [onProduct, product.id, product.naturalFibrePct]
  );

  return (
    <div>
      <span className="block text-xs font-semibold uppercase tracking-[0.15em] text-neutral-900">
        Fibre composition
      </span>
      {fabric && (
        <div className="mt-1.5 bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
          <p>{fabric}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-neutral-500">
            <span>From your website, part by part.</span>
            {!showEditor && !locked && (
              <TextButton onClick={() => setCorrecting(true)}>Correct it</TextButton>
            )}
          </p>
        </div>
      )}
      {showEditor && (
        <div className="mt-1.5">
          <CompositionEditor
            value={product.fibreComposition}
            locked={locked}
            invalid={below}
            onChange={onText}
          />
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {/* The natural share is only spoken of when it's a problem. */}
        {showEditor && below && (
          <span className="text-red-600">
            {pct}% natural: the event needs at least {MINIMUM_NATURAL_PCT}%, so this can&apos;t be sold.
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

/**
 * The empty picture slot: says so, and takes a photo straight from the
 * brand's phone or desktop rather than asking for a link.
 */
function PhotoUpload({
  token,
  productId,
  locked,
  onUploaded,
}: {
  token: string;
  productId: string;
  locked: boolean;
  onUploaded: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("token", token);
    body.set("productId", productId);
    body.set("photo", file);
    try {
      const res = await fetch("/api/vendor/photo", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not upload that photo.");
      onUploaded(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload that photo.");
      setBusy(false);
    }
  }

  return (
    <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 border border-dashed border-neutral-300 bg-neutral-50 p-4 text-center">
      <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
        No picture added
      </p>
      {!locked && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <Button
            size="small"
            variant="secondary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? "Uploading…" : "Upload a photo"}
          </Button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}

/** "Add a size" at the foot of the size table, for runs the site doesn't list. */
function AddSizeRow({
  token,
  productId,
  colour = null,
  onAdded,
}: {
  token: string;
  productId: string;
  /** For a product in several colours: which colour the new size belongs to. */
  colour?: string | null;
  onAdded: (variant: SelectorVariant) => void;
}) {
  const [size, setSize] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="mt-3">
        <TextButton onClick={() => setOpen(true)}>
          {colour ? `Add a size to ${colour}` : "Add a size"}
        </TextButton>
      </div>
    );
  }

  async function add() {
    if (!size.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/vendor/items/sizes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, productId, size: size.trim(), colour }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add that size.");
      onAdded(data.variant);
      setSize("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that size.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={size}
          onChange={(e) => setSize(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Another size, e.g. XXL"
          aria-label={colour ? `Add a size in ${colour}` : "Add a size"}
          className="w-52 border border-neutral-300 px-2 py-1.5 text-sm placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
        />
        <Button size="small" variant="secondary" disabled={busy || !size.trim()} onClick={add}>
          {busy ? "Adding…" : "Add"}
        </Button>
        <TextButton onClick={() => setOpen(false)}>Cancel</TextButton>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/**
 * A colour the website doesn't list: created in every size the product
 * already has, so it slots in as a full group of its own.
 */
function AddColourRow({
  token,
  product,
  onAdded,
}: {
  token: string;
  product: SelectorProduct;
  onAdded: (variant: SelectorVariant) => void;
}) {
  const [colour, setColour] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const sizes = [...new Set(product.variants.map((v) => v.size ?? ""))];

  if (!open) {
    return (
      <div className="mt-3">
        <TextButton onClick={() => setOpen(true)}>Add a colour</TextButton>
      </div>
    );
  }

  async function add() {
    const name = colour.trim();
    if (!name) return;
    if (product.variants.some((v) => (v.colour ?? "").toLowerCase() === name.toLowerCase())) {
      setError("That colour is already there.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const size of sizes) {
        const res = await fetch("/api/vendor/items/sizes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, productId: product.id, size: size || "One size", colour: name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not add that colour.");
        onAdded(data.variant);
      }
      setColour("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that colour.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={colour}
          onChange={(e) => setColour(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Another colour, e.g. Rust"
          aria-label="Add a colour"
          className="w-52 border border-neutral-300 px-2 py-1.5 text-sm placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
        />
        <Button size="small" variant="secondary" disabled={busy || !colour.trim()} onClick={add}>
          {busy ? "Adding…" : `Add in ${plural(sizes.length, "size")}`}
        </Button>
        <TextButton onClick={() => setOpen(false)}>Cancel</TextButton>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function SizeTable({
  token,
  product,
  locked,
  onVariant,
  onVariantAdded,
  onVariantRemoved,
}: {
  token: string;
  onVariantAdded: (productId: string, variant: SelectorVariant) => void;
  onVariantRemoved: (productId: string, variantId: string) => void;
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
  const multiColour =
    new Set(product.variants.map((v) => v.colour).filter(Boolean)).size > 1;

  const row = (variant: SelectorVariant) => (

        <div
          key={variant.id}
          className="grid grid-cols-[1fr_5rem_6rem_1.5rem] items-center gap-3 border-b border-neutral-100 py-2"
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
              className="checkbox"
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

          <PriceInput
            value={variant.popupPrice}
            disabled={locked || !variant.selected}
            onCommit={(n) =>
              onVariant(product.id, variant.id, { popupPrice: n }, { popup_price: n })
            }
          />

          {locked ? (
            <span />
          ) : (
            <button
              type="button"
              aria-label={`Remove size ${variant.size ?? ""}`}
              title="Remove this size"
              onClick={() => onVariantRemoved(product.id, variant.id)}
              className="justify-self-end px-1 text-lg leading-none text-neutral-400 hover:text-neutral-900"
            >
              ×
            </button>
          )}
        </div>
  );

  // Colour groups: one collapsible section per colour, open where something
  // in it is chosen, with a checkbox that takes every size in that colour.
  const groups = multiColour
    ? [...new Map(product.variants.map((v) => [v.colour ?? "", true])).keys()].map(
        (colour) => ({
          colour,
          variants: product.variants.filter((v) => (v.colour ?? "") === colour),
        })
      )
    : null;

  return (
    <div>
      <div className="grid grid-cols-[1fr_5rem_6rem_1.5rem] gap-3 border-b border-neutral-200 pb-2">
        {[groups ? "Variant" : "Size", "Qty", "Price", ""].map((h) => (
          <span
            key={h}
            className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-900"
          >
            {h}
          </span>
        ))}
      </div>

      {groups
        ? groups.map(({ colour, variants }) => {
            const chosen = variants.filter((v) => v.selected);
            const units = chosen.reduce((n, v) => n + (v.quantityDeclared ?? 0), 0);
            const all = chosen.length === variants.length;
            return (
              <details key={colour} open={chosen.length > 0} className="group border-b border-neutral-200">
                {/* The header only opens and closes. Choosing sizes happens
                    inside, per size or all at once, so nothing is two things. */}
                <summary className="flex cursor-pointer list-none items-center gap-3 py-3 hover:bg-neutral-50 [&::-webkit-details-marker]:hidden">
                  <Swatch colour={colour} />
                  <span className="text-sm font-medium">{colour || "No colour"}</span>
                  <span className="text-xs text-neutral-500">
                    {chosen.length === 0
                      ? `${variants.length} sizes`
                      : `Bringing ${chosen.length} of ${variants.length} sizes · ${plural(units, "piece")}`}
                  </span>
                  <span aria-hidden="true" className="ml-auto text-neutral-400">
                    <span className="group-open:hidden">+</span>
                    <span className="hidden group-open:inline">−</span>
                  </span>
                </summary>
                <div className="pb-3 pl-8">
                  {variants.map(row)}
                  {!locked && (
                    <AddSizeRow
                      token={token}
                      productId={product.id}
                      colour={colour || null}
                      onAdded={(variant) => onVariantAdded(product.id, variant)}
                    />
                  )}
                  {!locked && (
                    <div className="mt-2 flex gap-4">
                      {!all && (
                        <TextButton
                          onClick={() => {
                            for (const v of variants) onVariant(product.id, v.id, { selected: true }, { selected: true }, 0);
                          }}
                        >
                          Bring all sizes in {colour || "this colour"}
                        </TextButton>
                      )}
                      {chosen.length > 0 && (
                        <TextButton
                          onClick={() => {
                            for (const v of variants) onVariant(product.id, v.id, { selected: false }, { selected: false }, 0);
                          }}
                        >
                          None of this colour
                        </TextButton>
                      )}
                    </div>
                  )}
                </div>
              </details>
            );
          })
        : product.variants.map(row)}

      {!locked && !groups && (
        <AddSizeRow
          token={token}
          productId={product.id}
          onAdded={(variant) => onVariantAdded(product.id, variant)}
        />
      )}
      {!locked && groups && (
        <AddColourRow
          token={token}
          product={product}
          onAdded={(variant) => onVariantAdded(product.id, variant)}
        />
      )}

      <p className="mt-2 text-xs text-neutral-500">
        Prices are from your website. Change any that differ at the pop-up.
      </p>
    </div>
  );
}
