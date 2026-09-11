import Link from "next/link";
import { daysUntil, deadlineLabel } from "@/lib/dates";
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
 * Traffic-light colour per step: green once it's done, red when the deadline
 * is within two days or gone, amber for everything still to do with time in
 * hand. A step with no deadline (the agreement) is amber until signed.
 */
function tone(state: StepState, due?: string): "done" | "urgent" | "open" {
  if (state === "done" || state === "locked") return "done";
  if (due && daysUntil(due) <= 2) return "urgent";
  return "open";
}

const TONE_BOX: Record<ReturnType<typeof tone>, string> = {
  done: "border-emerald-600 bg-emerald-50 hover:bg-emerald-100",
  urgent: "border-red-600 bg-red-50 hover:bg-red-100",
  open: "border-amber-500 bg-amber-50 hover:bg-amber-100",
};

const TONE_LABEL: Record<ReturnType<typeof tone>, string> = {
  done: "text-emerald-800",
  urgent: "text-red-700",
  open: "text-amber-800",
};

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
    <ul className="space-y-3">
      {steps.map((step) => {
        const isCurrent = step.slug === currentSlug;
        const settled = step.state === "done" || step.state === "locked";
        const t = tone(step.state, step.due);
        return (
          <li key={step.slug}>
            <Link
              href={linkTo(`${base}/${step.slug}`)}
              aria-current={isCurrent ? "page" : undefined}
              className={`flex gap-5 border px-5 py-5 transition-colors ${TONE_BOX[t]} ${
                isCurrent ? "ring-1 ring-neutral-900" : ""
              }`}
            >
              <span className="w-6 shrink-0 pt-0.5 text-center">
                <StepMarker n={step.n} state={step.state} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-[15px] font-medium text-neutral-900">
                    {step.title}
                  </span>
                  <span
                    className={`text-[11px] uppercase tracking-[0.15em] ${TONE_LABEL[t]}`}
                  >
                    {settled
                      ? stateLabel(step.state)
                      : step.due
                      ? deadlineLabel(step.due)
                      : "To do"}
                  </span>
                </span>
                <span className="mt-1.5 block text-sm leading-relaxed text-neutral-600">
                  {step.detail ?? step.blurb}
                </span>
              </span>
              <span className="sr-only">{stateLabel(step.state)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
