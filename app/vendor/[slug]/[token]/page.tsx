import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, DetailTable, Eyebrow, Muted, PageHeading, Section } from "@/components/ui";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { NextAction, AllDone } from "@/components/vendor/next-action";
import { ProgressBar } from "@/components/vendor/progress-bar";
import { StepList } from "@/components/vendor/step-list";
import { completedCount, nextAction, stepsWithStatus } from "@/lib/steps";
import { vendorPath } from "@/lib/brands";
import { getVendorByToken, markOpened } from "@/lib/vendor";
import { getVendorSales, money } from "@/lib/live-event";
import { listAdminItems } from "@/lib/admin-items";
import { VendorItemsGrid } from "@/components/vendor/items-grid";

export const metadata: Metadata = {
  title: "Your page: Siftag at Fabrica X",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The vendor hub, in its event-weekend shape: sales first, then the
 * brand's own pieces with their live status, then reference material. The
 * onboarding steps that led here are kept, folded away at the bottom.
 */
export default async function VendorHub({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { token } = await params;
  const context = await getVendorByToken(token);
  if (!context) notFound();

  const { brand, progress } = context;
  await markOpened(brand);
  const [sales, items] = await Promise.all([getVendorSales(brand.id), listAdminItems(brand.id)]);

  const base = vendorPath(brand.slug, token);
  const steps = stepsWithStatus(progress, brand);
  const done = completedCount(progress);
  const next = nextAction(progress, brand);
  const outstanding = steps.length - done;

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <Container>
        <SiteHeader />

        <Section first>
          <Eyebrow>Siftag at Fabrica X</Eyebrow>
          {/* The one place a fourth visit should not look like the first.
              Greeted as the brand, not the contact: the link is shared
              around a studio, and whoever opens it is here for the brand. */}
          <PageHeading>{`The doors are open, ${brand.name}.`}</PageHeading>
          <div className="mt-5">
            <Muted>
              This page follows your pieces through the weekend: what has sold, what is on the rail and what is in the fitting
              room right now. Refresh for the latest.
            </Muted>
          </div>
          {/* Payment happened on the reservation site before they got here.
              Settled, so it's context: not one of the four steps. */}
          <p className="mt-6 text-[11px] uppercase tracking-[0.15em] text-neutral-500">
            <span className="text-neutral-900">
              {Number(brand.fee_gbp) > 0 ? `£${brand.fee_gbp} fee` : "No participation fee"}
              {brand.deposit_gbp != null &&
                Number(brand.deposit_gbp) < Number(brand.fee_gbp) &&
                `, £${brand.deposit_gbp} paid up front`}
            </span>{" "}
            ·{" "}
            {brand.commission_pct}% commission on pop-up sales
          </p>
          {/* Anything agreed that the standard line can't say: a deposit
              settled from sales, a separate rate for marketplace sales. */}
          {brand.payment_terms_note && (
            <p className="mt-2 text-sm leading-relaxed text-neutral-500">
              {brand.payment_terms_note}
            </p>
          )}
        </Section>

        <Section>
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <p className="text-[15px] font-medium">Your sales</p>
              <div className="mt-1.5">
                <Muted>
                  {sales.unitsSold === 0
                    ? "Nothing's sold yet — this updates live once the doors open."
                    : "Updates live as sales come in. Finalized once the event closes."}
                </Muted>
              </div>
            </div>
            <Link
              href={`${base}/sales`}
              className="text-xs uppercase tracking-[0.2em] underline underline-offset-4 hover:text-neutral-500"
            >
              Full breakdown →
            </Link>
          </div>
          <DetailTable
            evenSplit
            rows={[
              { label: "Units sold", value: String(sales.unitsSold) },
              { label: "Revenue", value: money(sales.grossGbp) },
              {
                label: `Commission (${sales.commissionPct}%)`,
                value: `-${money(sales.commissionGbp)}`,
              },
              { label: "Estimated payout", value: money(sales.netPayableGbp) },
              {
                label: "Live stock",
                value: `${sales.stock.available} available · ${sales.stock.held} held · ${sales.stock.fittingRoom} in fitting room · ${sales.stock.sold} sold`,
              },
            ]}
          />
        </Section>

        <Section>
          <p className="text-[15px] font-medium">Your pieces on the floor</p>
          <div className="mt-1.5 mb-6">
            <Muted>
              Every size with its tag codes. A crossed-out code has sold or is with a customer; the dots say which.
            </Muted>
          </div>
          <VendorItemsGrid items={items} />
        </Section>

        <Section>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 [&::-webkit-details-marker]:hidden">
              <div>
                <p className="text-[15px] font-medium">Before the pop-up</p>
                <div className="mt-1.5">
                  <Muted>
                    {done === steps.length
                      ? "All done. Kept here for reference."
                      : `${outstanding} of ${steps.length} step${steps.length === 1 ? "" : "s"} still open.`}
                  </Muted>
                </div>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] underline underline-offset-4 group-open:hidden">Show</span>
              <span className="hidden text-xs uppercase tracking-[0.2em] underline underline-offset-4 group-open:inline">Hide</span>
            </summary>
            <div className="mt-8">
              {next ? (
                <NextAction
                  base={base}
                  slug={next.slug}
                  title={next.title}
                  detail={next.detail ?? next.blurb}
                  due={next.due}
                  started={next.state === "in_progress"}
                />
              ) : (
                <AllDone tradingLabel="25 to 27 September" />
              )}
              <div className="mt-12">
                <ProgressBar done={done} total={steps.length} />
              </div>
              <div className="mt-8">
                <StepList base={base} steps={steps} />
              </div>
            </div>
          </details>
        </Section>

        <Section>
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <p className="text-[15px] font-medium">Everything else</p>
              <div className="mt-1.5">
                <Muted>
                  Venue, opening times, how you get paid, key dates, etc.
                </Muted>
              </div>
            </div>
            <Link
              href={`${base}/information`}
              className="text-xs uppercase tracking-[0.2em] underline underline-offset-4 hover:text-neutral-500"
            >
              Read it →
            </Link>
          </div>
        </Section>

        <SiteFooter />
      </Container>
    </main>
  );
}
