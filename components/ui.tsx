// The design system inherited from siftag-popup, written down.
//
// The pop-up site carries its styling as repeated utility strings across
// vendor-page.tsx, reserve-button.tsx and faq.tsx. Copying that approach into
// an app with a product selector and an admin area would mean re-deciding the
// same spacing and colour on every screen, so the recurring patterns are
// primitives here. Every value below is lifted from the pop-up site unchanged;
// the only additions are form controls and status pills, which that site never
// needed.

import type { ReactNode } from "react";

/* Layout ------------------------------------------------------------------ */

/** Vendor-facing column. Matches the pop-up site exactly. */
export function Container({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={
        wide
          ? "mx-auto max-w-admin px-6"
          : "mx-auto max-w-xl px-6 lg:max-w-2xl"
      }
    >
      {children}
    </div>
  );
}

/** Standard section rhythm: hairline rule above, 3.5rem of air. */
export function Section({
  children,
  first = false,
  id,
}: {
  children: ReactNode;
  first?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={first ? "py-14" : "border-t border-neutral-200 py-14"}
    >
      {children}
    </section>
  );
}

/* Type -------------------------------------------------------------------- */

/** Small caps label above a heading. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
      {children}
    </p>
  );
}

export function PageHeading({ children }: { children: ReactNode }) {
  return (
    <h1 className="mt-5 font-display text-4xl leading-[1.15] lg:text-5xl">
      {children}
    </h1>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-2xl lg:text-3xl">{children}</h2>;
}

/** Default body copy. 15px, near-black. */
export function Body({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-relaxed">{children}</p>;
}

/** Secondary copy. 14px, grey — the site's workhorse paragraph. */
export function Muted({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm leading-relaxed text-neutral-500">{children}</p>
  );
}

/* Lists ------------------------------------------------------------------- */

export type ListItem = { item: string; outcome?: string };

/** The pop-up site's divided list: bold line, grey explanation under it. */
export function DetailList({ items }: { items: ListItem[] }) {
  return (
    <ul className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
      {items.map((v) => (
        <li key={v.item} className="py-6">
          <p className="text-[15px] font-medium">{v.item}</p>
          {v.outcome && (
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">
              {v.outcome}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Two-column key/value table — the event details and key dates in section A.
 * Stacks on mobile, where a third of the column isn't enough for a date range.
 * `evenSplit` widens the label side for rows whose label is itself a date.
 */
export function DetailTable({
  rows,
  evenSplit = false,
}: {
  rows: { label: string; value: ReactNode }[];
  evenSplit?: boolean;
}) {
  return (
    <dl className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
      {rows.map((row) => (
        <div
          key={row.label}
          className={`grid gap-1 py-5 sm:gap-6 ${
            evenSplit ? "sm:grid-cols-2" : "sm:grid-cols-3"
          }`}
        >
          <dt className="text-[15px] font-medium">{row.label}</dt>
          <dd
            className={`text-sm leading-relaxed text-neutral-500 ${
              evenSplit ? "" : "sm:col-span-2"
            }`}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Plain bulleted list, for the prose sections of the vendor pack. */
export function Bullets({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-5 space-y-3 text-sm leading-relaxed text-neutral-500">
      {children}
    </ul>
  );
}

export function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      {/* A square, not a dash or a disc: this copy uses em dashes heavily, so a
          dash marker reads as punctuation, and nothing else on the site is
          round. */}
      <span
        aria-hidden="true"
        className="mt-[0.5rem] h-1 w-1 shrink-0 bg-neutral-400"
      />
      <span>{children}</span>
    </li>
  );
}

/** Emphasis inside grey body copy: lifts to full-strength ink, never bold. */
export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-medium text-neutral-900">{children}</strong>;
}

/** The pop-up site's disclosure list, content-agnostic. */
export function Accordion({
  items,
}: {
  items: { q: string; a: ReactNode }[];
}) {
  return (
    <div className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 [&::-webkit-details-marker]:hidden">
            <span className="text-[15px] font-medium text-neutral-900">
              {item.q}
            </span>
            <span
              aria-hidden="true"
              className="text-xl font-light leading-none text-neutral-400 transition-transform duration-200 group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <div className="pb-5 pr-8 text-sm leading-relaxed text-neutral-500">
            {item.a}
          </div>
        </details>
      ))}
    </div>
  );
}

/* Controls ---------------------------------------------------------------- */

const BUTTON_BASE =
  "uppercase tracking-[0.2em] transition-colors disabled:cursor-not-allowed";

const BUTTON_VARIANTS = {
  // The pop-up site's only button.
  primary:
    "bg-neutral-900 text-white hover:bg-neutral-700 disabled:bg-neutral-300",
  secondary:
    "border border-neutral-900 text-neutral-900 hover:bg-neutral-100 disabled:border-neutral-300 disabled:text-neutral-300",
  danger:
    "border border-red-600 text-red-600 hover:bg-red-50 disabled:border-neutral-300 disabled:text-neutral-300",
} as const;

const BUTTON_SIZES = {
  large: "py-4 text-sm",
  compact: "py-3 text-xs",
  // Row-level actions in admin tables and the selector grid.
  small: "px-4 py-2 text-[11px]",
} as const;

export function Button({
  variant = "primary",
  size = "large",
  full = false,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  full?: boolean;
}) {
  return (
    <button
      {...props}
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${
        BUTTON_SIZES[size]
      } ${full ? "w-full" : ""} ${className}`}
    />
  );
}

const CONTROL =
  "w-full border border-neutral-300 bg-white px-3 py-2.5 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-500";

/**
 * Label, control, and the space where a validation reason goes. Fibre
 * composition and quantity both need the reason to sit on the field itself
 * rather than surfacing at submit, so `error` is part of the primitive.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && !error && (
        <span className="mt-1.5 block text-xs text-neutral-500">{hint}</span>
      )}
      {error && (
        <span className="mt-1.5 block text-xs text-red-600">{error}</span>
      )}
    </label>
  );
}

export function Input({
  invalid = false,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      className={`${CONTROL} ${invalid ? "border-red-600" : ""} ${className}`}
    />
  );
}

export function Textarea({
  invalid = false,
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...props}
      className={`${CONTROL} ${invalid ? "border-red-600" : ""} ${className}`}
    />
  );
}

/* Status ------------------------------------------------------------------ */

const PILL_TONES = {
  neutral: "border-neutral-300 text-neutral-500",
  done: "border-neutral-900 text-neutral-900",
  warn: "border-amber-600 text-amber-700",
  error: "border-red-600 text-red-600",
} as const;

/**
 * Submission state, approval state, delivery mismatches. Outlined rather than
 * filled — the pop-up site has no filled colour anywhere except the button,
 * and status shouldn't outrank the primary action.
 */
export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof PILL_TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block border px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Short centred rule, as used on the confirmation page. */
export function Rule() {
  return <div className="mx-auto h-px w-12 bg-neutral-300" />;
}
