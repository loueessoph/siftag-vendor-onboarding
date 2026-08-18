/**
 * Section A of siftag-vendor-pack.md, edited down.
 *
 * Two rules apply to everything here: no em dashes (a colon or a full stop
 * instead), and the tone stays informative rather than salesy. The
 * reservation site does the selling; by the time a brand reaches this app
 * they have already paid.
 *
 * Split into named sections so the vendor hub can pull in the parts a brand
 * needs at a given moment without sending them back to the public page.
 */

import {
  Accordion,
  Bullet,
  Bullets,
  DetailTable,
  Muted,
  Section,
  SectionHeading,
  Strong,
} from "@/components/ui";

export function TheEvent() {
  return (
    <Section>
      <SectionHeading>The event</SectionHeading>
      <DetailTable
        rows={[
          { label: "Venue", value: "Fabrica X, 36–40 York Way, London N1 9AB" },
          {
            label: "Trading",
            value: "Friday 25 to Sunday 27 September, 9am to 6pm daily",
          },
          { label: "Set-up", value: "Thursday 24 September, 9am to 6pm" },
          { label: "Pack-down", value: "Monday 28 September" },
          { label: "Expected footfall", value: "Around 1,500 across the weekend" },
        ]}
      />
      <div className="mt-6">
        <Muted>
          Entry is free and ticketed, promoted to Siftag&apos;s community of
          100,000+ users and 55,000+ social followers, plus Fabrica X&apos;s own
          audience.
        </Muted>
      </div>
    </Section>
  );
}

export function YourSpace() {
  return (
    <Section>
      <SectionHeading>Your space</SectionHeading>
      <div className="mt-6 space-y-4">
        <Muted>
          You get approximately <Strong>8m²</Strong> within the curated floor
          layout. We provide rails, hangers, shelving, tables and display
          equipment, so you don&apos;t need to bring furniture.
        </Muted>
        <Muted>
          You don&apos;t need to tag, hang, steam or price anything: our team
          handles tagging, hanging and merchandising on site.
        </Muted>
        <Muted>
          You&apos;re welcome to bring printed branding: posters, signage,
          cards, lookbooks.{" "}
          <Strong>
            Screens, monitors and video displays aren&apos;t permitted
          </Strong>{" "}
          without written approval from us, as a condition of the venue.
        </Muted>
        <Muted>
          We set the overall floor layout and customer flow, and we&apos;ll
          place you where your products work best alongside the rest of the
          lineup.
        </Muted>
      </div>
    </Section>
  );
}

export function GettingStockToUs() {
  return (
    <Section id="stock">
      <SectionHeading>Getting your stock to us</SectionHeading>
      <div className="mt-6 space-y-4">
        <Muted>
          <Strong>Ship it or drop it off: both work.</Strong>
        </Muted>
        <Muted>
          Send to: <Strong>FAO Siftag</Strong>, Fabrica X, 36–40 York Way,
          London N1 9AB. The FAO line matters: the venue takes deliveries for
          several tenants, so anything not addressed to Siftag may not reach us.
        </Muted>
      </div>
      <Bullets>
        <Bullet>
          <Strong>We accept stock from 18 August up to 10 September.</Strong>{" "}
          Everything must be with us by 10 September.
        </Bullet>
        <Bullet>
          Or bring it in person on{" "}
          <Strong>Thursday 24 September between 9am and 6pm</Strong>.
        </Bullet>
        <Bullet>
          Label every box clearly with <Strong>FAO Siftag</Strong>,{" "}
          <Strong>your brand name</Strong> and <Strong>[X of Y]</Strong> so we
          can check the delivery in.
        </Bullet>
      </Bullets>
      <div className="mt-5">
        <Muted>
          <Strong>UK brands</Strong> arrange and cover their own shipping in and
          out. <Strong>International brands:</Strong> we cover shipping both
          ways as part of your package, so get in touch and we&apos;ll sort the
          labels.
        </Muted>
      </div>
    </Section>
  );
}

export function YourProductList() {
  return (
    <Section id="product-list">
      <SectionHeading>Your product list, due 4 September</SectionHeading>
      <div className="mt-6 space-y-4">
        <Muted>
          Everything you&apos;re selling has to be on your list before the
          event. We run one central till for the whole pop-up, so a customer can
          buy across several brands in one transaction: every item needs a price
          and a code in the system before doors open.{" "}
          <Strong>If it isn&apos;t on the list, we can&apos;t sell it.</Strong>
        </Muted>
        <Muted>
          You&apos;ll get a private link to your own catalogue. Pick the pieces
          you&apos;re bringing, set the quantity per size, and adjust the price
          if your pop-up price differs from your online price. It saves as you
          go, so you can start now, check your stock, and come back. Nothing is
          final until you press submit.
        </Muted>
        <Muted>
          One field you&apos;ll need to fill in by hand:{" "}
          <Strong>fibre composition</Strong>, per item. Every piece sold at the
          event must be <Strong>at least 90% natural fibre</Strong>, and
          composition rarely comes through cleanly from a product feed.
          We&apos;ll confirm approval on each item once your list is in.
        </Muted>
        <Muted>
          <Strong>Deadline: 4 September.</Strong> We print tags and build the
          till from these lists, so we can&apos;t take late additions.
        </Muted>
      </div>
    </Section>
  );
}

export function HowYouGetPaid() {
  return (
    <Section id="paid">
      <SectionHeading>How you get paid</SectionHeading>
      <Bullets>
        <Bullet>
          You keep <Strong>90% of your sales</Strong>. Siftag retains 10%
          commission.
        </Bullet>
        <Bullet>
          <Strong>Card processing fees are deducted on top</Strong> of the
          commission. Stripe&apos;s published rates are 1.4% + 10p per
          transaction on EEA cards and 2.9% + 10p on non-EEA cards.
        </Bullet>
        <Bullet>
          Within <Strong>14 days of the event</Strong> we send you a full sales
          breakdown showing what sold, and pay the balance by{" "}
          <Strong>bank transfer</Strong>.
        </Bullet>
        <Bullet>
          We&apos;ll issue a <Strong>self-billed sales invoice</Strong> for the
          sales made on your behalf, so you don&apos;t need to invoice us.
        </Bullet>
      </Bullets>
    </Section>
  );
}

export function OnTheDay() {
  return (
    <Section>
      <SectionHeading>On the day</SectionHeading>
      <div className="mt-6">
        <Muted>
          You&apos;re welcome to come and work your own space: most brands do,
          and customers love meeting founders. You&apos;re not required to. Our
          team is on site across all three days and will staff your space at no
          extra cost if you can&apos;t be there, or can only make part of the
          weekend.
        </Muted>
      </div>
    </Section>
  );
}

export function Marketing() {
  return (
    <Section>
      <SectionHeading>Marketing</SectionHeading>
      <div className="mt-6 space-y-4">
        <Muted>
          We&apos;ll be promoting the lineup across Siftag&apos;s channels, with
          dedicated vendor features in the run-up.
        </Muted>
        <Muted>
          Your agreement asks you to share{" "}
          <Strong>at least 3 posts or stories</Strong> about your participation
          before the event.
        </Muted>
      </div>
    </Section>
  );
}

export function KeyDates() {
  return (
    <Section id="dates">
      <SectionHeading>Key dates</SectionHeading>
      <DetailTable
        evenSplit
        rows={[
          { label: "From 18 August", value: "We can receive your stock" },
          { label: "4 September", value: "Product list due" },
          { label: "10 September", value: "All stock must have arrived" },
          {
            label: "Thu 24 September, 9am to 6pm",
            value: "Set-up and in-person drop-off",
          },
          {
            label: "Fri 25 to Sun 27 September, 9am to 6pm",
            value: "Trading",
          },
          { label: "Mon 28 September", value: "Pack-down" },
          {
            label: "Within 14 days of the event",
            value: "Sales report and payment",
          },
        ]}
      />
    </Section>
  );
}

export function QuestionsWeGetAsked() {
  return (
    <Section id="questions">
      <SectionHeading>Questions we get asked</SectionHeading>
      <Accordion
        items={[
          {
            q: "What if something is stolen or damaged?",
            a: "Your stock stays yours throughout, and we can't accept liability for loss or damage. In practice: it's a ticketed event rather than an open shop, our team is present throughout opening hours, stock is stored securely overnight between trading days, and we're working with Fabrica X on security for the space.",
          },
          {
            q: "Can I restock mid-event?",
            a: "Yes. Either send surplus with your original delivery and we'll hold it as backstock, or bring more down yourself on any trading day.",
          },
          {
            q: "What happens with returns?",
            a: "Sales at the pop-up are final sale. Refunds are only for faulty or not-as-described goods, within 30 days. If a refund arises from a product fault or incorrect information, it comes out of your sales.",
          },
          {
            q: "Can I change my product list after 4 September?",
            a: "Small corrections, yes. New items, no: tags and till entries are built from the list.",
          },
          {
            q: "Can I cancel?",
            a: "The participation fee is non-refundable once paid.",
          },
        ]}
      />
    </Section>
  );
}
