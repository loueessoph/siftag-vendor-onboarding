import { Button, Muted, Pill, TextButton, Textarea } from "@/components/ui";
import { reviewProductAction } from "@/app/admin/actions";
import {
  reviewFlags,
  type ApprovalStatus,
  type SubmissionReview,
  type SubmittedProduct,
} from "@/lib/approvals";
import { formatDate } from "@/lib/dates";
import { money, plural } from "@/lib/format";
import { splitNotes } from "@/lib/fibre";
import { compareSizes } from "@/lib/selection";

/**
 * One submitted product per card: what the brand sent, why we might hesitate,
 * and the decision. Same shape as the vendor's selector card so a reviewer
 * who has seen the brand's page recognises the item, but with the approve
 * and reject buttons where the brand had the size table.
 *
 * Server-rendered forms rather than a client component: every decision is a
 * round trip anyway, and it keeps this page working with no JavaScript.
 */
export function SubmissionReviewList({
  brandId,
  review,
  returnTo,
}: {
  brandId: string;
  review: SubmissionReview;
  returnTo: string;
}) {
  return (
    <div className="space-y-4">
      {review.products.map((product) => (
        <ReviewCard
          key={product.productId ?? product.title}
          brandId={brandId}
          product={product}
          returnTo={returnTo}
        />
      ))}
    </div>
  );
}

/** "3 approved · 1 rejected · 5 to review", for headings and the tracker. */
export function reviewSummary(review: SubmissionReview): string {
  const parts: string[] = [];
  if (review.counts.approved) parts.push(`${review.counts.approved} approved`);
  if (review.counts.rejected) parts.push(`${review.counts.rejected} rejected`);
  if (review.counts.pending) parts.push(`${review.counts.pending} to review`);
  return parts.join(" · ") || "Nothing submitted";
}

export function submittedLine(review: SubmissionReview): string {
  const units = review.products.reduce(
    (n, p) => n + p.variants.reduce((m, v) => m + v.quantity, 0),
    0
  );
  return `${plural(review.products.length, "item")} · ${plural(
    units,
    "piece"
  )}, submitted ${formatDate(review.submittedAt.slice(0, 10))}`;
}

/**
 * The size run as a table: one row per size, quantity and pop-up price in
 * their own columns, sizes in wearing order. Same layout as the vendor's
 * own size table so the two sides are looking at the same thing.
 */
function SizeTable({ variants }: { variants: SubmittedProduct["variants"] }) {
  const rows = [...variants].sort(
    (a, b) =>
      (a.colour ?? "").localeCompare(b.colour ?? "") || compareSizes(a.size, b.size)
  );
  const multiColour = new Set(rows.map((v) => v.colour).filter(Boolean)).size > 1;
  const total = rows.reduce((n, v) => n + v.quantity, 0);
  return (
    <table className="mt-4 w-full max-w-md text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
          <th className="pb-2 text-left font-normal">Size</th>
          <th className="pb-2 text-right font-normal">Qty</th>
          <th className="pb-2 text-right font-normal">Price</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-200 border-y border-neutral-200">
        {rows.map((v) => (
          <tr key={v.sku}>
            <td className="py-2">
              {v.size ?? "One size"}
              {multiColour && v.colour && (
                <span className="ml-2 text-neutral-500">{v.colour}</span>
              )}
            </td>
            <td className="py-2 text-right tabular-nums">{v.quantity}</td>
            <td className="py-2 text-right tabular-nums">
              {v.popupPrice != null ? money(v.popupPrice) : <span className="text-red-600">Missing</span>}
            </td>
          </tr>
        ))}
      </tbody>
      {rows.length > 1 && (
        <tfoot>
          <tr className="text-neutral-500">
            <td className="pt-2">Total</td>
            <td className="pt-2 text-right tabular-nums">{total}</td>
            <td />
          </tr>
        </tfoot>
      )}
    </table>
  );
}

const STATUS_PILL: Record<
  ApprovalStatus,
  { tone: "neutral" | "done" | "error"; label: string }
> = {
  pending: { tone: "neutral", label: "To review" },
  approved: { tone: "done", label: "Approved" },
  rejected: { tone: "error", label: "Rejected" },
};

function ReviewCard({
  brandId,
  product,
  returnTo,
}: {
  brandId: string;
  product: SubmittedProduct;
  returnTo: string;
}) {
  const flags = reviewFlags(product);
  const pill = STATUS_PILL[product.approvalStatus];
  const units = product.variants.reduce((n, v) => n + v.quantity, 0);

  return (
    <article
      id={product.productId ? `product-${product.productId}` : undefined}
      className={`border p-5 ${
        product.approvalStatus === "rejected" ? "border-red-600" : "border-neutral-200"
      }`}
    >
      <div className="flex items-start gap-6">
        {/* Shown at the photo's own proportions, never cropped or stretched:
            a reviewer is judging the garment. The card grows to fit. */}
        <div className="w-40 shrink-0 bg-neutral-100 sm:w-2/5 sm:max-w-md">
          {product.imageUrl && (
            // Straight from the brand's CDN, as in the selector.
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
            <div>
              <p className="text-[15px] font-medium">
                {product.url ? (
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-900"
                  >
                    {product.title}
                  </a>
                ) : (
                  product.title
                )}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {[product.colour, `${plural(units, "piece")}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {product.custom && <Pill>Added by the brand</Pill>}
              <Pill tone={pill.tone}>{pill.label}</Pill>
            </div>
          </div>

          {(() => {
            const { fabric, own } = splitNotes(product.vendorNotes);
            return (
              <>
                {fabric && (
                  <div className="mt-4 text-sm">
                    <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                      Fabric content on their website
                    </p>
                    <p className="mt-1 text-neutral-600">{fabric}</p>
                  </div>
                )}
                {own.trim() && (
                  <div className="mt-4 text-sm">
                    <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                      Notes from the brand
                    </p>
                    <p className="mt-1 leading-relaxed">{own}</p>
                  </div>
                )}
              </>
            );
          })()}

          <div className="mt-4 text-sm">
            <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
              Fibre composition
            </p>
            <p className="mt-1">{product.fibreComposition ?? "Not given"}</p>
          </div>

          <SizeTable variants={product.variants} />

          {flags.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs text-red-600">
              {flags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          )}

          {product.productId ? (
            <form action={reviewProductAction} className="mt-5">
              <input type="hidden" name="brand_id" value={brandId} />
              <input type="hidden" name="product_id" value={product.productId} />
              <input type="hidden" name="return_to" value={returnTo} />
              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                  Note to the brand
                </span>
                <Textarea
                  name="note"
                  rows={2}
                  defaultValue={product.approvalNote ?? ""}
                  placeholder="Optional. They see this next to the item."
                  className="mt-1.5"
                />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  size="small"
                  type="submit"
                  name="decision"
                  value="approved"
                  disabled={product.approvalStatus === "approved"}
                >
                  Approve
                </Button>
                <Button
                  size="small"
                  variant="danger"
                  type="submit"
                  name="decision"
                  value="rejected"
                  disabled={product.approvalStatus === "rejected"}
                >
                  Reject
                </Button>
                {product.approvalStatus !== "pending" && (
                  <TextButton type="submit" name="decision" value="pending">
                    Undo decision
                  </TextButton>
                )}
              </div>
            </form>
          ) : (
            <div className="mt-4">
              <Muted>
                This product has since been removed from the catalogue, so it
                can&apos;t be approved. Ask the brand what happened.
              </Muted>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
