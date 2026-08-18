import Link from "next/link";
import { deadlineLabel, isUrgent } from "@/lib/dates";
import type { StepSlug } from "@/lib/steps";

/**
 * The one thing to do next, above everything else on the hub. Most vendor-pack
 * failures aren't information failures — the information was on page four — so
 * this is the only element on the page allowed to fill a surface.
 */
export function NextAction({
  base,
  slug,
  title,
  detail,
  due,
  started,
  linkTo = (href) => href,
}: {
  base: string;
  slug: StepSlug;
  title: string;
  detail?: string;
  due?: string;
  started: boolean;
  linkTo?: (href: string) => string;
}) {
  const urgent = due ? isUrgent(due) : false;

  return (
    <Link
      href={linkTo(`${base}/${slug}`)}
      className="group block border border-neutral-900 bg-neutral-900 p-6 text-white transition-colors hover:bg-neutral-700 sm:p-8"
    >
      <span className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
        {due ? deadlineLabel(due) : "Next"}
        {urgent && " · soon"}
      </span>
      <p className="mt-3 font-display text-2xl leading-snug lg:text-3xl">
        {title}
      </p>
      {detail && (
        <p className="mt-3 text-sm leading-relaxed text-neutral-300">
          {detail}
        </p>
      )}
      <span className="mt-6 inline-block text-xs uppercase tracking-[0.2em]">
        {started ? "Pick up where you left off" : "Start"}
        <span
          aria-hidden="true"
          className="ml-2 inline-block transition-transform group-hover:translate-x-1"
        >
          →
        </span>
      </span>
    </Link>
  );
}

/** Shown when a brand has nothing outstanding. */
export function AllDone({ tradingLabel }: { tradingLabel: string }) {
  return (
    <div className="border border-neutral-200 p-6 sm:p-8">
      <span className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
        Nothing outstanding
      </span>
      <p className="mt-3 font-display text-2xl leading-snug lg:text-3xl">
        You&apos;re all set.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-neutral-500">
        We&apos;ll see you at Fabrica X on {tradingLabel}. We&apos;ll email if
        anything else comes up.
      </p>
    </div>
  );
}
