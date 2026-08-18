import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Eyebrow, Muted, PageHeading, Section } from "@/components/ui";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { NextAction, AllDone } from "@/components/vendor/next-action";
import { ProgressBar } from "@/components/vendor/progress-bar";
import { StepList } from "@/components/vendor/step-list";
import { completedCount, nextAction, stepsWithStatus } from "@/lib/steps";
import { vendorPath } from "@/lib/brands";
import { getVendorByToken, markOpened } from "@/lib/vendor";

export const metadata: Metadata = {
  title: "Your onboarding: Siftag at Fabrica X",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The vendor hub. Ordered so the next action and its date sit above
 * everything else, then progress, then the steps, then reference material.
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

  const base = vendorPath(brand.slug, token);
  const steps = stepsWithStatus(progress);
  const done = completedCount(progress);
  const next = nextAction(progress);
  const outstanding = steps.length - done;
  // "Welcome back" is earned by having done something, not by having loaded
  // the page before. Until the agreement is signed a brand is still arriving,
  // however many times they've looked.
  const started = brand.agreement_status === "signed";
  const firstName = brand.contact_name?.split(" ")[0];

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <Container>
        <SiteHeader />

        <Section first>
          <Eyebrow>{brand.name}</Eyebrow>
          {/* The one place a fourth visit should not look like the first. */}
          <PageHeading>
            {!started
              ? "You're in."
              : firstName
              ? `Welcome back, ${firstName}.`
              : "Welcome back."}
          </PageHeading>
          <div className="mt-5">
            <Muted>
              {!started
                ? `Your spot at Fabrica X is confirmed. There ${
                    outstanding === 1 ? "is one thing" : `are ${outstanding} things`
                  } left to do before the weekend, and this page is where you do them. Nothing has to be finished in one sitting. It saves as you go, so come back as often as you need.`
                : "Everything is saved where you left it. Here's what's still outstanding."}
            </Muted>
          </div>
          {/* Payment happened on the reservation site before they got here.
              Settled, so it's context: not one of the four steps. */}
          <p className="mt-6 text-[11px] uppercase tracking-[0.15em] text-neutral-500">
            <span className="text-neutral-900">£{brand.fee_gbp} fee</span> ·{" "}
            {brand.commission_pct}% commission on sales
          </p>
        </Section>

        <Section>
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
