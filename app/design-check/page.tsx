import {
  Body,
  Button,
  Container,
  DetailList,
  DetailTable,
  Eyebrow,
  Field,
  Input,
  Muted,
  PageHeading,
  Pill,
  Rule,
  Section,
  SectionHeading,
  Textarea,
} from "@/components/ui";

// Every primitive on one page, so the inherited look can be checked against
// the pop-up site side by side before any real screen is built. Delete once
// the vendor and admin areas exist.
export default function DesignCheck() {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <Container>
        <Section first>
          <Eyebrow>Design check</Eyebrow>
          <PageHeading>Inherited from the pop-up site.</PageHeading>
          <div className="mt-5">
            <Muted>
              Gilda Display for headings, Geist for everything else. Square
              corners, hairline neutral-200 rules, one black button.
            </Muted>
          </div>
        </Section>

        <Section>
          <SectionHeading>Detail list</SectionHeading>
          <DetailList
            items={[
              {
                item: "Product list due 4 September",
                outcome:
                  "We print tags and build the till from these lists, so we can't take late additions.",
              },
              {
                item: "All stock must arrive by 10 September",
                outcome: "Or bring it in person on Thursday 24 September.",
              },
            ]}
          />
        </Section>

        <Section>
          <SectionHeading>Detail table</SectionHeading>
          <DetailTable
            rows={[
              { label: "Venue", value: "Fabrica X, 36–40 York Way, N1 9AB" },
              {
                label: "Trading",
                value: "Friday 25 – Sunday 27 September, 9am–6pm daily",
              },
            ]}
          />
        </Section>

        <Section>
          <SectionHeading>Controls</SectionHeading>
          <div className="mt-8 space-y-6">
            <Field
              label="Fibre composition"
              hint="Per item, as it appears on the care label."
            >
              <Input placeholder="100% organic cotton" />
            </Field>
            <Field
              label="Fibre composition"
              error="Must be at least 90% natural fibre to sell at the event."
            >
              <Input invalid defaultValue="60% cotton, 40% polyester" />
            </Field>
            <Field label="Sizing notes">
              <Textarea rows={3} placeholder="Anything that helps us sell it." />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="small">Submit list</Button>
              <Button size="small" variant="secondary">
                Request a change
              </Button>
              <Button size="small" variant="danger">
                Reject
              </Button>
              <Button size="small" disabled>
                Submitted
              </Button>
            </div>
            <Button full>Submit my product list</Button>
          </div>
        </Section>

        <Section>
          <SectionHeading>Status</SectionHeading>
          <div className="mt-8 flex flex-wrap gap-3">
            <Pill>Not opened</Pill>
            <Pill tone="warn">In progress</Pill>
            <Pill tone="done">Submitted</Pill>
            <Pill tone="error">Quantity mismatch</Pill>
          </div>
        </Section>

        <Section>
          <div className="text-center">
            <Body>Sophie &amp; the Siftag team</Body>
            <div className="mt-8">
              <Rule />
            </div>
          </div>
        </Section>
      </Container>
    </main>
  );
}
