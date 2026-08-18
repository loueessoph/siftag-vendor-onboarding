"use client";

import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { updateBrandAction } from "@/app/admin/actions";
import type { BrandRow } from "@/lib/brands";

/**
 * Terms, editable in place. Whatever is saved here is what the brand's
 * agreement and hub say the next time they load, so the two can't drift.
 *
 * Once a brand has signed, the commercial fields lock behind a deliberate
 * unlock: editing a fee after signature contradicts a document someone has
 * already put their name to.
 */
export function BrandEditor({
  brand,
  signed,
}: {
  brand: BrandRow;
  signed: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const termsLocked = signed && !unlocked;

  if (!editing) {
    return (
      <section className="py-10 first:pt-0">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl">Terms</h2>
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] uppercase tracking-[0.15em] text-neutral-500 underline underline-offset-4 transition-colors hover:text-neutral-900"
          >
            Edit
          </button>
        </div>
        <dl className="mt-6 divide-y divide-neutral-200">
          <Row label="Participation fee" value={`£${brand.fee_gbp}`} />
          {brand.deposit_gbp != null && (
            <Row label="Deposit paid" value={`£${brand.deposit_gbp}`} />
          )}
          {brand.balance_terms && (
            <Row label="Balance" value={brand.balance_terms} />
          )}
          <Row label="Commission" value={`${brand.commission_pct}%`} />
          <Row
            label="Shipping"
            value={
              brand.is_international
                ? "International, we cover it both ways"
                : "UK, brand arranges their own"
            }
          />
        </dl>
      </section>
    );
  }

  return (
    <section className="py-10 first:pt-0">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl">Terms</h2>
        <button
          onClick={() => setEditing(false)}
          className="text-[11px] uppercase tracking-[0.15em] text-neutral-500 underline underline-offset-4 transition-colors hover:text-neutral-900"
        >
          Cancel
        </button>
      </div>

      {signed && (
        <div className="mt-6 border border-neutral-300 p-4">
          <p className="text-sm leading-relaxed text-neutral-500">
            {brand.name} signed on{" "}
            {brand.agreement_signed_at
              ? new Date(brand.agreement_signed_at).toLocaleDateString("en-GB")
              : "an earlier date"}
            . Changing the fee or commission now would contradict the agreement
            they signed.
          </p>
          {!unlocked && (
            <button
              onClick={() => setUnlocked(true)}
              className="mt-3 text-[11px] uppercase tracking-[0.15em] text-red-600 underline underline-offset-4"
            >
              Change them anyway
            </button>
          )}
        </div>
      )}

      <form action={updateBrandAction} className="mt-8 max-w-xl space-y-6">
        <input type="hidden" name="brand_id" value={brand.id} />

        <Field label="Brand name">
          <Input name="name" defaultValue={brand.name} required />
        </Field>
        <Field label="Legal name">
          <Input name="legal_name" defaultValue={brand.legal_name ?? ""} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Contact name">
            <Input name="contact_name" defaultValue={brand.contact_name ?? ""} />
          </Field>
          <Field label="Contact email">
            <Input
              name="contact_email"
              type="email"
              defaultValue={brand.contact_email}
              required
            />
          </Field>
        </div>
        <Field label="Shopify domain">
          <Input
            name="shopify_domain"
            defaultValue={brand.shopify_domain ?? ""}
          />
        </Field>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name="is_international"
            defaultChecked={brand.is_international}
            className="h-4 w-4 accent-neutral-900"
          />
          <span className="text-sm text-neutral-500">
            International brand, Siftag covers shipping both ways
          </span>
        </label>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Participation fee (£)">
            <Input
              name="fee_gbp"
              defaultValue={String(brand.fee_gbp)}
              inputMode="decimal"
              required
              disabled={termsLocked}
            />
          </Field>
          <Field label="Commission (%)">
            <Input
              name="commission_pct"
              defaultValue={String(brand.commission_pct)}
              inputMode="decimal"
              disabled={termsLocked}
            />
          </Field>
          <Field label="Deposit paid (£)">
            <Input
              name="deposit_gbp"
              defaultValue={
                brand.deposit_gbp == null ? "" : String(brand.deposit_gbp)
              }
              inputMode="decimal"
              disabled={termsLocked}
            />
          </Field>
          <Field label="How the balance is settled">
            <Input
              name="balance_terms"
              defaultValue={brand.balance_terms ?? ""}
              disabled={termsLocked}
            />
          </Field>
        </div>

        <Button size="compact" type="submit">
          Save
        </Button>
      </form>
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
