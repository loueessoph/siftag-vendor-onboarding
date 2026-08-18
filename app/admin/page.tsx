import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell, Empty } from "@/components/admin/chrome";
import { Pill } from "@/components/ui";
import { catalogueStats, listBrands, type BrandRow } from "@/lib/brands";
import { KEY_DATES, deadlineLabel } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Siftag pop-up admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The tracker. Sorted so whoever needs chasing hardest is at the top — a
 * glance should answer "who do I phone", not "here are fourteen brands".
 */
export default async function AdminHome() {
  const brands = await listBrands();
  const rows = await Promise.all(
    brands.map(async (brand) => ({
      brand,
      stats: await catalogueStats(brand.id),
    }))
  );
  rows.sort((a, b) => urgency(b.brand) - urgency(a.brand));

  const submitted = brands.filter(
    (b) => b.submission_status === "submitted"
  ).length;

  return (
    <AdminShell
      eyebrow={deadlineLabel(KEY_DATES.productList)}
      title={
        brands.length === 0
          ? "No brands yet"
          : `${submitted} of ${brands.length} lists in`
      }
      action={
        <Link
          href="/admin/brands/new"
          className="border border-neutral-900 px-5 py-3 text-[11px] uppercase tracking-[0.2em] transition-colors hover:bg-neutral-900 hover:text-white"
        >
          Add a brand
        </Link>
      }
    >
      {rows.length === 0 ? (
        <Empty>
          Add your first brand and you&apos;ll get their private link to send.
        </Empty>
      ) : (
        <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
          {rows.map(({ brand, stats }) => (
            <li key={brand.id}>
              <Link
                href={`/admin/brands/${brand.id}`}
                className="group grid gap-3 py-6 transition-colors hover:bg-neutral-50 lg:grid-cols-[16rem_1fr_auto] lg:items-center lg:gap-6"
              >
                <div>
                  <p className="text-[15px] font-medium">{brand.name}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {brand.brand_code} · £{brand.fee_gbp} ·{" "}
                    {brand.commission_pct}%
                  </p>
                </div>

                <p className="text-sm leading-relaxed text-neutral-500">
                  {describe(brand, stats)}
                </p>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Pill
                    tone={brand.agreement_status === "signed" ? "done" : "warn"}
                  >
                    {brand.agreement_status === "signed"
                      ? "Signed"
                      : "Unsigned"}
                  </Pill>
                  <Pill tone={STATE_TONE[brand.submission_status] ?? "neutral"}>
                    {STATE_LABEL[brand.submission_status] ??
                      brand.submission_status}
                  </Pill>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

const STATE_LABEL: Record<string, string> = {
  not_opened: "Not opened",
  opened: "Opened, empty",
  in_progress: "In progress",
  submitted: "Submitted",
};

const STATE_TONE: Record<string, "neutral" | "warn" | "done"> = {
  not_opened: "neutral",
  opened: "warn",
  in_progress: "warn",
  submitted: "done",
};

/** Higher means more in need of a phone call. */
function urgency(brand: BrandRow): number {
  if (brand.submission_status === "submitted") return 0;
  if (brand.agreement_status !== "signed") return 4;
  if (brand.submission_status === "not_opened") return 3;
  if (brand.submission_status === "opened") return 2;
  return 1;
}

/** One sentence saying what this brand's situation actually is. */
function describe(
  brand: BrandRow,
  stats: Awaited<ReturnType<typeof catalogueStats>>
): string {
  if (brand.submission_status === "submitted") {
    return `${stats.selectedProducts} products submitted${
      stats.missingComposition > 0
        ? ` · ${stats.missingComposition} missing composition`
        : ""
    }`;
  }
  if (brand.agreement_status !== "signed") {
    return brand.last_opened_at
      ? "Opened their link but hasn't signed yet."
      : "Hasn't opened their link: nothing signed.";
  }
  if (stats.products === 0) {
    return brand.shopify_domain
      ? `Signed. Catalogue not scraped yet: nothing for them to pick from.`
      : "Signed. No Shopify domain, so they need a CSV upload.";
  }
  if (stats.selectedProducts === 0) {
    return `Signed. ${stats.products} products waiting, none selected yet.`;
  }
  return `${stats.selectedProducts} of ${stats.products} selected${
    stats.missingComposition > 0
      ? ` · ${stats.missingComposition} still need composition`
      : ""
  }`;
}
