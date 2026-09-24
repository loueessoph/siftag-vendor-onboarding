import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/chrome";
import { CopyLink } from "@/components/admin/copy-link";
import { Button, ButtonLink, Muted, Pill } from "@/components/ui";
import { catalogueStats, getBrand, vendorPath } from "@/lib/brands";
import { scrapeBrandAction } from "@/app/admin/actions";
import { BrandEditor } from "@/components/admin/brand-editor";
import { listDeliveries } from "@/lib/vendor";
import { getSubmissionReview } from "@/lib/approvals";
import {
  SubmissionReviewList,
  reviewSummary,
  submittedLine,
} from "@/components/admin/submission-review";

export const metadata: Metadata = {
  title: "Brand: Siftag pop-up admin",
  robots: { index: false, follow: false },
};

export default async function BrandDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    scraped?: string;
    error?: string;
    updated?: string;
  }>;
}) {
  const { id } = await params;
  const { created, scraped, error, updated } = await searchParams;

  const brand = await getBrand(id);
  if (!brand) notFound();

  const stats = await catalogueStats(brand.id);
  const deliveries = await listDeliveries(brand.id);
  const review = await getSubmissionReview(brand.id);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";
  const url = `${origin}${vendorPath(brand.slug, brand.access_token)}`;
  const signed = brand.agreement_status === "signed";

  return (
    <AdminShell eyebrow={brand.brand_code} title={brand.name}>
      {created && (
        <Banner tone="ok">
          Brand created. Send them the link below to start their onboarding.
        </Banner>
      )}
      {scraped && <ScrapeSummary value={scraped} />}
      {updated && <Banner tone="ok">Terms updated. Their page already shows it.</Banner>}
      {error && <Banner tone="error">{decodeURIComponent(error)}</Banner>}

      <div className="grid gap-12 lg:grid-cols-[1fr_20rem]">
        <div>
          <BrandEditor brand={brand} signed={signed} />

          <Panel title="Catalogue">
            {stats.products === 0 ? (
              <div className="py-2">
                <Muted>
                  Nothing pulled yet.{" "}
                  {brand.shopify_domain
                    ? `Scraping ${brand.shopify_domain} will fetch their products, images, sizes and prices.`
                    : "No store domain on file, so this brand needs a CSV upload."}
                </Muted>
              </div>
            ) : (
              <>
                <Row label="Products" value={String(stats.products)} />
                <Row label="Variants" value={String(stats.variants)} />
                <Row
                  label="Excluded"
                  value={
                    stats.excluded > 0
                      ? `${stats.excluded} (gift cards and similar)`
                      : "None"
                  }
                />
                <Row
                  label="Selected by brand"
                  value={
                    stats.selectedProducts === 0
                      ? "Nothing yet"
                      : `${stats.selectedProducts} products · ${stats.selectedVariants} variants`
                  }
                />
                {stats.missingComposition > 0 && (
                  <Row
                    label="Missing composition"
                    value={`${stats.missingComposition} selected products`}
                  />
                )}
              </>
            )}

            {brand.shopify_domain && (
              <form action={scrapeBrandAction} className="pt-6">
                <input type="hidden" name="brand_id" value={brand.id} />
                <Button size="small" variant="secondary" type="submit">
                  {stats.products === 0
                    ? `Scrape ${brand.shopify_domain}`
                    : "Re-scrape"}
                </Button>
                {stats.products > 0 && (
                  <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                    Refreshes titles, images and online prices. Never touches
                    fibre composition, selections, pop-up prices or quantities.
                  </p>
                )}
              </form>
            )}
          </Panel>

          <Panel title="Submitted list" id="submitted">
            {review ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 pb-6">
                  <Muted>
                    {submittedLine(review)}
                    {brand.submission_status !== "submitted" &&
                      ". They've edited since and not re-submitted; this is the list that stands."}
                  </Muted>
                  <Pill tone={review.counts.pending > 0 ? "warn" : "done"}>
                    {reviewSummary(review)}
                  </Pill>
                </div>
                <SubmissionReviewList
                  brandId={brand.id}
                  review={review}
                  returnTo={`/admin/brands/${brand.id}`}
                />
              </>
            ) : (
              <div className="py-2">
                <Muted>
                  Nothing submitted yet. Once they press submit, every item
                  appears here to approve or reject.
                </Muted>
              </div>
            )}
          </Panel>

          <Panel title="From the vendor">
            <Row
              label="VAT number"
              value={brand.vat_number ?? "Not given yet"}
            />
            <Row
              label="Boxes declared"
              value={
                deliveries.length === 0
                  ? "Nothing sent yet"
                  : deliveries
                      .map(
                        (d) =>
                          `${d.box_count} ${
                            d.box_count === 1 ? "box" : "boxes"
                          }${d.tracking_reference ? ` (${d.tracking_reference})` : ""}${
                            d.received_at ? " received" : ""
                          }${d.notes ? `: “${d.notes}”` : ""}`
                      )
                      .join(", ")
              }
            />
            <Row
              label="Posts shared"
              value={
                (brand.post_urls ?? []).length === 0
                  ? "None yet"
                  : `${(brand.post_urls ?? []).length} of 3`
              }
            />
            <Row
              label="Days attending"
              value={
                (brand.attending_days ?? []).length === 0
                  ? "Not told us yet"
                  : (brand.attending_days ?? [])
                      .map((d) => DAY_LABEL[d] ?? d)
                      .join(", ")
              }
            />
            <Row
              label="Special requests"
              value={brand.special_requests ?? "None"}
            />
            {(brand.post_urls ?? []).length > 0 && (
              <div className="py-4">
                <ul className="space-y-1">
                  {(brand.post_urls ?? []).map((url, i) => (
                    <li key={`${i}-${url}`}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm underline underline-offset-2 hover:text-neutral-500"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </div>

        <aside className="space-y-8">
          <CopyLink url={url} />

          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
              Tags
            </p>
            <div className="mt-4">
              <ButtonLink href={`/api/admin/tags?brandId=${brand.id}`} prefetch={false}>
                Print tags
              </ButtonLink>
              <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                A4 PDF, one tag per garment with its QR and code. Only ticked,
                approved units with stock declared.
              </p>
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
              Status
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Pill tone={signed ? "done" : "neutral"}>
                {signed ? "Agreement signed" : "Not signed"}
              </Pill>
              <Pill tone={brand.fee_paid_at ? "done" : "neutral"}>
                {brand.fee_paid_at ? "Fee paid" : "Fee not recorded"}
              </Pill>
              <Pill
                tone={
                  brand.submission_status === "submitted" ? "done" : "warn"
                }
              >
                {SUBMISSION_LABEL[brand.submission_status] ??
                  brand.submission_status}
              </Pill>
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
              Contact
            </p>
            <div className="mt-3 space-y-1 text-sm text-neutral-500">
              {brand.contact_name && <p>{brand.contact_name}</p>}
              <p>
                <a
                  href={`mailto:${brand.contact_email}`}
                  className="underline underline-offset-2 hover:text-neutral-900"
                >
                  {brand.contact_email}
                </a>
              </p>
              {brand.shopify_domain && <p>{brand.shopify_domain}</p>}
              {brand.is_international && <p>International: we ship both ways</p>}
            </div>
          </div>
        </aside>
      </div>
    </AdminShell>
  );
}

const DAY_LABEL: Record<string, string> = {
  "2026-09-25": "Fri 25",
  "2026-09-26": "Sat 26",
  "2026-09-27": "Sun 27",
};

const SUBMISSION_LABEL: Record<string, string> = {
  not_opened: "Link not opened",
  opened: "Opened, empty",
  in_progress: "List in progress",
  submitted: "List submitted",
};

function ScrapeSummary({ value }: { value: string }) {
  const [added, updated, variants, excluded, seeded] = value
    .split(".")
    .map(Number);
  return (
    <Banner tone="ok">
      Scrape finished: {added} new products, {updated} updated, {variants} new
      variants
      {excluded > 0 ? `, ${excluded} excluded as non-physical` : ""}
      {seeded > 0
        ? `, fibre composition read from the description for ${seeded}`
        : ""}
      .
    </Banner>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "ok" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mb-10 border p-5 text-sm leading-relaxed ${
        tone === "ok"
          ? "border-neutral-900 text-neutral-900"
          : "border-red-600 text-red-600"
      }`}
    >
      {children}
    </div>
  );
}

function Panel({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  // The submitted list carries its own cards; everything else is label/value rows.
  const rows = id !== "submitted";
  return (
    <section
      id={id}
      className="border-t border-neutral-200 py-10 first:border-t-0 first:pt-0"
    >
      <h2 className="font-display text-xl">{title}</h2>
      {rows ? (
        <dl className="mt-6 divide-y divide-neutral-200">{children}</dl>
      ) : (
        <div className="mt-6">{children}</div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-3 sm:gap-6">
      <dt className="text-sm font-medium">{label}</dt>
      <dd className="text-sm leading-relaxed text-neutral-500 sm:col-span-2">
        {value}
      </dd>
    </div>
  );
}
