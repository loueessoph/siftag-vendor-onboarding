import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell, Empty } from "@/components/admin/chrome";
import {
  SubmissionReviewList,
  reviewSummary,
  submittedLine,
} from "@/components/admin/submission-review";
import { Muted, Pill } from "@/components/ui";
import { listSubmissionReviews } from "@/lib/approvals";

export const metadata: Metadata = {
  title: "Approvals: Siftag pop-up admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Every submitted item across every brand, brands with the most still to
 * review first. Decisions are made here or on the brand's own page; it's the
 * same form either way.
 */
export default async function Approvals({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const reviews = await listSubmissionReviews();
  reviews.sort((a, b) => b.review.counts.pending - a.review.counts.pending);

  const pending = reviews.reduce((n, r) => n + r.review.counts.pending, 0);
  const items = reviews.reduce((n, r) => n + r.review.products.length, 0);

  return (
    <AdminShell
      eyebrow="Approvals"
      title={
        reviews.length === 0
          ? "Nothing submitted yet"
          : pending === 0
          ? `All ${items} items reviewed`
          : `${pending} of ${items} items to review`
      }
    >
      {error && (
        <div className="mb-8 border border-red-600 p-5 text-sm text-red-600">
          {decodeURIComponent(error)}
        </div>
      )}

      {reviews.length === 0 ? (
        <Empty>
          Items appear here once a brand submits their list. Approvals and
          notes show on the brand&apos;s page straight away.
        </Empty>
      ) : (
        <div className="space-y-16">
          {reviews.map(({ brandId, brandName, brandCode, review }) => (
            <section key={brandId} id={`brand-${brandId}`}>
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
                    {brandCode}
                  </p>
                  <h2 className="mt-1 font-display text-2xl">
                    <Link
                      href={`/admin/brands/${brandId}`}
                      className="transition-colors hover:text-neutral-500"
                    >
                      {brandName}
                    </Link>
                  </h2>
                  <div className="mt-1">
                    <Muted>{submittedLine(review)}</Muted>
                  </div>
                </div>
                <Pill tone={review.counts.pending > 0 ? "warn" : "done"}>
                  {reviewSummary(review)}
                </Pill>
              </div>
              <div className="mt-6">
                <SubmissionReviewList
                  brandId={brandId}
                  review={review}
                  returnTo="/admin/approvals"
                />
              </div>
            </section>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
