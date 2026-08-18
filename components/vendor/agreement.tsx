"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, Input, Muted } from "@/components/ui";
import { signAgreementAction } from "@/app/vendor/actions";
import {
  AGREEMENT_BLOCKERS,
  AGREEMENT_CLAUSES,
  AGREEMENT_RECITALS,
  AGREEMENT_SUBTITLE,
  AGREEMENT_TITLE,
  SIFTAG_SIGNATORY,
  fill,
  type AgreementVars,
} from "@/content/agreement";

/** The contract itself, set as a document rather than as page furniture. */
export function AgreementText({ vars }: { vars: AgreementVars }) {
  return (
    <article>
      {AGREEMENT_BLOCKERS.length > 0 && <BlockerBanner />}

      <header className="border-b border-neutral-200 pb-8">
        <h2 className="font-display text-2xl lg:text-3xl">{AGREEMENT_TITLE}</h2>
        <p className="mt-2 text-sm text-neutral-500">{AGREEMENT_SUBTITLE}</p>
        <div className="mt-6 space-y-3">
          {AGREEMENT_RECITALS.map((para, i) => (
            <p key={i} className="text-sm leading-relaxed text-neutral-500">
              {fill(para, vars)}
            </p>
          ))}
        </div>
      </header>

      <div className="divide-y divide-neutral-200">
        {AGREEMENT_CLAUSES.map((clause) => (
          <section key={clause.n} className="py-8">
            <h3 className="flex gap-4 text-[15px] font-medium">
              <span className="font-display text-neutral-400">{clause.n}</span>
              {clause.heading}
            </h3>
            <div className="mt-3 space-y-3 sm:pl-8">
              {clause.body.map((para, i) => (
                <p key={i} className="text-sm leading-relaxed text-neutral-500">
                  {fill(para, vars)}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="border-t border-neutral-200 py-8">
        <h3 className="flex gap-4 text-[15px] font-medium">
          <span className="font-display text-neutral-400">13</span>
          Signatures
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-neutral-500 sm:pl-8">
          The parties indicate acceptance of this Agreement by signing below.
        </p>
        <dl className="mt-6 space-y-1 text-sm text-neutral-500 sm:pl-8">
          <dt className="font-medium text-neutral-900">
            Signed for and on behalf of {SIFTAG_SIGNATORY.entity}
          </dt>
          <dd>{SIFTAG_SIGNATORY.name}</dd>
          <dd>{SIFTAG_SIGNATORY.title}</dd>
          <dd>{SIFTAG_SIGNATORY.email}</dd>
          <dd>{SIFTAG_SIGNATORY.date}</dd>
        </dl>
      </section>
    </article>
  );
}

/**
 * The text contradicts the rest of the operation in the ways listed in
 * content/agreement.ts. Signing stays off until those are settled — a brand
 * must not sign a deadline we aren't going to hold them to.
 */
function BlockerBanner() {
  return (
    <div className="mb-10 border border-red-600 p-5">
      <p className="text-[11px] uppercase tracking-[0.2em] text-red-600">
        Signing disabled · {AGREEMENT_BLOCKERS.length} unresolved
      </p>
      <p className="mt-3 text-sm leading-relaxed text-neutral-900">
        This is your real agreement text, but it disagrees with the rest of the
        site in the ways below. Fix the text, clear{" "}
        <code className="text-neutral-500">AGREEMENT_BLOCKERS</code> in{" "}
        <code className="text-neutral-500">content/agreement.ts</code>, and
        signing switches on.
      </p>
      <ul className="mt-4 space-y-2">
        {AGREEMENT_BLOCKERS.map((b) => (
          <li key={b} className="flex gap-3 text-sm leading-relaxed text-neutral-500">
            <span
              aria-hidden="true"
              className="mt-[0.5rem] h-1 w-1 shrink-0 bg-red-600"
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A typed signature is a valid electronic signature under UK law, but it is
 * only worth anything if you can later show who signed, when, and — above all
 * — which words they were shown. So this captures name, position and email,
 * records the agreement version alongside the timestamp, and refuses to
 * submit until the affirmation is ticked.
 */
export function SignatureBlock({
  token,
  brandLegalName,
  signedAt,
  signedBy,
}: {
  token: string;
  brandLegalName: string;
  signedAt?: string;
  signedBy?: string;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);

  if (signedAt && signedBy) {
    return <SignedReceipt signedAt={signedAt} signedBy={signedBy} />;
  }

  const blocked = AGREEMENT_BLOCKERS.length > 0;
  const ready =
    name.trim().length > 1 &&
    role.trim().length > 1 &&
    email.includes("@") &&
    agreed;

  return (
    <form
      action={signAgreementAction}
      className="border border-neutral-900 p-6 sm:p-8"
    >
      <input type="hidden" name="token" value={token} />
      <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
        Signed for and on behalf of Vendor
      </p>
      <p className="mt-3 font-display text-xl">{brandLegalName}</p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <Field label="Your full name">
          <Input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="India Grace"
            autoComplete="name"
            disabled={blocked}
          />
        </Field>
        <Field label="Your title">
          <Input
            name="title"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Founder"
            autoComplete="organization-title"
            disabled={blocked}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Your email" hint="We&apos;ll send your signed copy here.">
            <Input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="india@indiagracelondon.com"
              autoComplete="email"
              disabled={blocked}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          {/* Clause 2.6 makes VAT the vendor's representation, so they state
              it here rather than us guessing at onboarding. */}
          <Field
            label="VAT number"
            hint="Leave blank if you're not VAT registered."
          >
            <Input name="vat_number" placeholder="GB123456789" />
          </Field>
        </div>
      </div>

      <label className="mt-6 flex cursor-pointer gap-3">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          disabled={blocked}
          className="mt-0.5 h-4 w-4 shrink-0 accent-neutral-900"
        />
        <span className="text-sm leading-relaxed text-neutral-500">
          I have read the agreement above and I have authority to sign it on
          behalf of {brandLegalName}. I understand that typing my name here is
          my signature.
        </span>
      </label>

      <div className="mt-8">
        <SignButton disabled={blocked || !ready} blocked={blocked} />
      </div>

      <div className="mt-4">
        <Muted>
          We&apos;ll email you a copy the moment you sign, and let the Siftag
          team know.
        </Muted>
      </div>
    </form>
  );
}

/** Disables itself while the action is in flight, so nobody signs twice. */
function SignButton({
  disabled,
  blocked,
}: {
  disabled: boolean;
  blocked: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button full type="submit" disabled={disabled || pending}>
      {blocked
        ? "Signing disabled"
        : pending
        ? "Signing\u2026"
        : "Sign the agreement"}
    </Button>
  );
}

function SignedReceipt({
  signedAt,
  signedBy,
}: {
  signedAt: string;
  signedBy: string;
}) {
  return (
    <div className="border border-neutral-200 p-6 sm:p-8">
      <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
        Signed
      </p>
      <p className="mt-3 font-display text-xl">
        Signed by {signedBy} on {signedAt}.
      </p>
      <div className="mt-3">
        <Muted>
          A copy was emailed to you at the time. Nothing else to do here: ask
          us if you need another copy.
        </Muted>
      </div>
    </div>
  );
}
