import type { Metadata } from "next";
import {
  Container,
  Eyebrow,
  Muted,
  PageHeading,
  Section,
  Strong,
} from "@/components/ui";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import {
  GettingStockToUs,
  HowYouGetPaid,
  KeyDates,
  Marketing,
  OnTheDay,
  QuestionsWeGetAsked,
  TheEvent,
  YourProductList,
  YourSpace,
} from "@/components/vendor-info";

export const metadata: Metadata = {
  title: "Siftag Pop-Up at Fabrica X: Vendor Information",
  description:
    "Everything you need for the Siftag pop-up at Fabrica X, King's Cross, 25 to 27 September 2026.",
  robots: { index: false, follow: false },
};

// Section A of siftag-vendor-pack.md, in order, verbatim. The copy lives in
// components/vendor-info.tsx so the vendor hub can reuse the same sections.
export default function VendorInformationPage() {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <Container>
        <SiteHeader />

        <Section first>
          <Eyebrow>Vendor information</Eyebrow>
          <PageHeading>Welcome.</PageHeading>
          <div className="mt-5 space-y-4">
            <Muted>
              You&apos;re part of Siftag&apos;s first in-person shopping event :
              three days of natural-fibre and non-toxic brands at Fabrica X in
              King&apos;s Cross, in partnership with The Mills Fabrica.
            </Muted>
            <Muted>
              Everything you need is on this page. There are three things to do:{" "}
              <Strong>sign your agreement</Strong>,{" "}
              <Strong>send us your product list by 4 September</Strong>, and{" "}
              <Strong>get your stock to us by 10 September</Strong>. We handle
              the rest.
            </Muted>
          </div>
        </Section>

        <TheEvent />
        <YourSpace />
        <GettingStockToUs />
        <YourProductList />
        <HowYouGetPaid />
        <OnTheDay />
        <Marketing />
        <KeyDates />
        <QuestionsWeGetAsked />

        <Section>
          <Muted>
            Anything else, email{" "}
            <a
              href="mailto:brands@siftag.com"
              className="underline underline-offset-2 hover:text-neutral-900"
            >
              brands@siftag.com
            </a>
            .
          </Muted>
        </Section>

        <SiteFooter />
      </Container>
    </main>
  );
}
