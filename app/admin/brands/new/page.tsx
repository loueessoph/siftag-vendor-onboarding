import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/chrome";
import { Button, Field, Input } from "@/components/ui";
import { CsvDropzone } from "@/components/admin/csv-dropzone";
import { createBrandAction } from "@/app/admin/actions";

export const metadata: Metadata = {
  title: "Add a brand: Siftag pop-up admin",
  robots: { index: false, follow: false },
};

export default async function NewBrand({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <AdminShell eyebrow="New" title="Add a brand">
      {error === "required" && (
        <div className="mb-8 border border-red-600 p-5 text-sm text-red-600">
          Brand name, contact email and fee are all needed.
        </div>
      )}

      <form action={createBrandAction} className="max-w-2xl">
        <Section title="The brand">
          <Field label="Brand name">
            <Input name="name" required placeholder="India Grace London" />
          </Field>
          <Field label="Legal name">
            <Input name="legal_name" placeholder="India Grace London Ltd" />
          </Field>
          <Field label="Contact name">
            <Input name="contact_name" placeholder="India" />
          </Field>
          <Field label="Contact email">
            <Input
              name="contact_email"
              type="email"
              required
              placeholder="india@indiagracelondon.com"
            />
          </Field>
          <Field label="Shopify domain">
            <Input name="shopify_domain" placeholder="indiagracelondon.com" />
          </Field>
          <CsvDropzone />
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              name="is_international"
              className="h-4 w-4 accent-neutral-900"
            />
            <span className="text-sm text-neutral-500">
              International brand: Siftag covers shipping both ways
            </span>
          </label>
        </Section>

        <Section title="Their terms">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Participation fee (£)">
              <Input
                name="fee_gbp"
                required
                inputMode="decimal"
                placeholder="350"
              />
            </Field>
            <Field label="Commission (%)">
              <Input
                name="commission_pct"
                inputMode="decimal"
                defaultValue="10"
              />
            </Field>
            <Field
              label="Deposit paid (£)"
              hint="Leave blank if they paid the whole fee up front."
            >
              <Input name="deposit_gbp" inputMode="decimal" placeholder="175" />
            </Field>
          </div>
          <Field label="How the balance is settled">
            <Input
              name="balance_terms"
              placeholder="deducted from sales proceeds"
            />
          </Field>
        </Section>

        <div className="mt-10 max-w-sm">
          <Button full type="submit">
            Create brand
          </Button>
        </div>
      </form>
    </AdminShell>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-neutral-200 py-10 first:border-t-0 first:pt-0">
      <h2 className="font-display text-xl">{title}</h2>
      <div className="mt-8 space-y-6">{children}</div>
    </section>
  );
}
