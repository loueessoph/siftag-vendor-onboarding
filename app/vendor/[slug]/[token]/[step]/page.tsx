import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Bullet, Bullets, Container, Muted, Strong } from "@/components/ui";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { StepShell } from "@/components/vendor/step-shell";
import { AgreementText, SignatureBlock } from "@/components/vendor/agreement";
import {
  GettingStockToUs,
  HowYouGetPaid,
  KeyDates,
  Marketing as MarketingInfo,
  OnTheDay as OnTheDayInfo,
  QuestionsWeGetAsked,
  TheEvent,
  YourSpace,
} from "@/components/vendor-info";
import { STEPS, type StepSlug } from "@/lib/steps";
import { formatDate } from "@/lib/dates";
import { vendorPath } from "@/lib/brands";
import { getVendorByToken, type VendorContext } from "@/lib/vendor";
import { DispatchForm, PostsForm, WeekendForm } from "@/components/vendor/forms";
import { listDeliveries } from "@/lib/vendor";
import { Selector } from "@/components/vendor/selector";
import { getSelectorProducts } from "@/lib/selection";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ step: string }>;
}): Promise<Metadata> {
  const { step: slug } = await params;
  const step = STEPS.find((s) => s.slug === slug);
  return {
    title: step
      ? `${step.title}: Siftag at Fabrica X`
      : "Everything else: Siftag at Fabrica X",
    robots: { index: false, follow: false },
  };
}

export default async function StepPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; token: string; step: string }>;
  searchParams: Promise<{
    error?: string;
    signed?: string;
    nomail?: string;
    saved?: string;
  }>;
}) {
  const { token, step: stepSlug } = await params;
  const { error, signed, nomail, saved } = await searchParams;

  const context = await getVendorByToken(token);
  if (!context) notFound();

  const base = vendorPath(context.brand.slug, token);

  if (stepSlug === "information") return <InformationPage base={base} />;

  const index = STEPS.findIndex((s) => s.slug === stepSlug);
  if (index === -1) notFound();

  const step = STEPS[index];
  const status = context.progress[step.slug];

  return (
    <StepShell
      base={base}
      step={step}
      state={status.state}
      detail={status.detail}
      prev={STEPS[index - 1]}
      next={STEPS[index + 1]}
    >
      <StepBody
        slug={step.slug}
        token={token}
        context={context}
        error={error}
        justSigned={signed === "1"}
        mailFailed={nomail === "1"}
        saved={saved}
        products={
          step.slug === "products"
            ? await getSelectorProducts(context.brand.id)
            : []
        }
        deliveries={
          step.slug === "stock" ? await listDeliveries(context.brand.id) : []
        }
      />
    </StepShell>
  );
}

function StepBody({
  slug,
  token,
  context,
  error,
  justSigned,
  mailFailed,
  saved,
  products,
  deliveries,
}: {
  slug: StepSlug;
  token: string;
  context: VendorContext;
  error?: string;
  justSigned: boolean;
  mailFailed: boolean;
  saved?: string;
  products: Awaited<ReturnType<typeof getSelectorProducts>>;
  deliveries: Awaited<ReturnType<typeof listDeliveries>>;
}) {
  const { brand, agreementVars } = context;

  switch (slug) {
    case "agreement":
      return (
        <div>
          {justSigned && (
            <div className="mb-10 border border-neutral-900 p-5 text-sm leading-relaxed">
              {mailFailed
                ? "Signed. We couldn't email your copy just now: it's recorded, and we'll send it shortly."
                : "Signed. A copy is on its way to you by email."}
            </div>
          )}
          {error === "incomplete" && (
            <div className="mb-10 border border-red-600 p-5 text-sm text-red-600">
              We need your name, your title and an email address.
            </div>
          )}
          {error === "already-signed" && (
            <div className="mb-10 border border-red-600 p-5 text-sm text-red-600">
              This agreement has already been signed.
            </div>
          )}
          <AgreementText vars={agreementVars} />
          <div className="mt-12">
            <SignatureBlock
              token={token}
              brandLegalName={agreementVars.brandLegalName}
              signedAt={
                brand.agreement_signed_at
                  ? formatDate(brand.agreement_signed_at.slice(0, 10))
                  : undefined
              }
              signedBy={brand.agreement_signed_name ?? undefined}
            />
          </div>
        </div>
      );

    case "products":
      return (
        <Selector
          token={token}
          initialProducts={products}
          locked={brand.submission_status === "submitted"}
        />
      );

    case "stock":
      return (
        <div className="-mt-14">
          <GettingStockToUs />
          <div className="border-t border-neutral-200 py-14">
            <DispatchForm
              token={token}
              deliveries={deliveries}
              error={error}
              saved={saved === "1"}
            />
          </div>
        </div>
      );

    case "marketing":
      return (
        <div className="-mt-14">
          <MarketingInfo />
          <div className="border-t border-neutral-200 py-14">
            <PostsForm
              token={token}
              postUrls={brand.post_urls ?? []}
              error={error}
            />
          </div>
          <OnTheDayInfo />
          <div className="border-t border-neutral-200 py-14">
            <WeekendForm
              token={token}
              attendingDays={brand.attending_days ?? []}
              specialRequests={brand.special_requests}
              saved={saved === "plans"}
            />
          </div>
        </div>
      );

  }
}

/** Everything that isn't a task: the reference half of the vendor pack. */
function InformationPage({ base }: { base: string }) {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <Container>
        <SiteHeader />
        <div className="pt-10">
          <Link
            href={base}
            className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 transition-colors hover:text-neutral-900"
          >
            <span aria-hidden="true">←</span> Your onboarding
          </Link>
        </div>
        <section className="pt-8">
          <p className="font-display text-4xl leading-[1.15] lg:text-5xl">
            Everything else.
          </p>
          <div className="mt-5">
            <Muted>
              Nothing here needs doing: it&apos;s the detail you might want
              before the weekend.
            </Muted>
          </div>
        </section>
        <TheEvent />
        <YourSpace />
        <HowYouGetPaid />
        <KeyDates />
        <QuestionsWeGetAsked />
        <SiteFooter />
      </Container>
    </main>
  );
}
