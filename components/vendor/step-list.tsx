import Link from "next/link";
import { deadlineLabel } from "@/lib/dates";
import type { StepState } from "@/lib/steps";

/** Numeral or tick in the gutter — the state at a glance. */
function StepMarker({ n, state }: { n: string; state: StepState }) {
  // A submitted list is finished work, so it ticks like anything else. The
  // fact that it's frozen belongs in the detail line, not in a marker that
  // would read as a failure.
  if (state === "done" || state === "locked") {
    return (
      <span aria-hidden="true" className="font-display text-sm text-neutral-900">
        ✓
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`font-display text-sm ${
        state === "in_progress" ? "text-neutral-900" : "text-neutral-400"
      }`}
    >
      {n}
    </span>
  );
}

function stateLabel(state: StepState): string {
  switch (state) {
    case "done":
      return "Done";
    case "locked":
      return "Submitted";
    case "in_progress":
      return "In progress";
    default:
      return "Not started";
  }
}

/**
 * Every step, always clickable. A brand who can't count stock this week must
 * still be able to jump to their marketing posts, so nothing here is gated on
 * the step above it.
 */
export function StepList({
  base,
  steps,
  currentSlug,
  linkTo = (href) => href,
}: {
  base: string;
  linkTo?: (href: string) => string;
  steps: {
    n: string;
    slug: string;
    title: string;
    blurb: string;
    due?: string;
    state: StepState;
    detail?: string;
  }[];
  currentSlug?: string;
}) {
  return (
    <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
      {steps.map((step) => {
        const isCurrent = step.slug === currentSlug;
        const settled = step.state === "done" || step.state === "locked";
        return (
          <li key={step.slug}>
            <Link
              href={linkTo(`${base}/${step.slug}`)}
              aria-current={isCurrent ? "page" : undefined}
              className={`group flex gap-5 py-6 transition-colors ${
                isCurrent ? "bg-neutral-50" : "hover:bg-neutral-50"
              }`}
            >
              <span className="w-6 shrink-0 pt-0.5 text-center">
                <StepMarker n={step.n} state={step.state} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span
                    className={`text-[15px] font-medium ${
                      settled ? "text-neutral-400" : "text-neutral-900"
                    }`}
                  >
                    {step.title}
                  </span>
                  {step.due && !settled && (
                    <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                      {deadlineLabel(step.due)}
                    </span>
                  )}
                </span>
                <span className="mt-1.5 block text-sm leading-relaxed text-neutral-500">
                  {step.detail ?? step.blurb}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="shrink-0 self-center text-neutral-300 transition-transform group-hover:translate-x-1 group-hover:text-neutral-900"
              >
                →
              </span>
              <span className="sr-only">{stateLabel(step.state)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
