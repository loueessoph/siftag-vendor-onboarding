import Link from "next/link";
import type { ReactNode } from "react";
import { Container, Eyebrow, Muted, PageHeading, Pill } from "@/components/ui";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { deadlineLabel } from "@/lib/dates";
import { STEPS, type StepDefinition, type StepState } from "@/lib/steps";

const STATE_PILL: Record<
  StepState,
  { tone: "neutral" | "done" | "warn"; label: string }
> = {
  done: { tone: "done", label: "Done" },
  locked: { tone: "done", label: "Submitted" },
  in_progress: { tone: "warn", label: "In progress" },
  todo: { tone: "neutral", label: "Not started" },
};

/**
 * Frame for a single step. Carries the way back to the hub and, at the foot,
 * the way to the adjacent steps — so a brand who opens the wrong one, or
 * finishes one and wants to keep going, never has to reverse out.
 */
export function StepShell({
  base,
  step,
  state,
  detail,
  prev,
  next,
  children,
  linkTo = (href) => href,
}: {
  base: string;
  step: StepDefinition;
  state: StepState;
  detail?: string;
  prev?: StepDefinition;
  next?: StepDefinition;
  children: ReactNode;
  linkTo?: (href: string) => string;
}) {
  const pill = STATE_PILL[state];

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <Container>
        <SiteHeader />

        <div className="pt-10">
          <Link
            href={linkTo(base)}
            className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 transition-colors hover:text-neutral-900"
          >
            <span aria-hidden="true">←</span> Your onboarding
          </Link>
        </div>

        <section className="pt-8 pb-14">
          <div className="flex items-center gap-4">
            <Eyebrow>
              Step {step.n} of {String(STEPS.length).padStart(2, "0")}
            </Eyebrow>
            <Pill tone={pill.tone}>{pill.label}</Pill>
          </div>
          <PageHeading>{step.title}</PageHeading>
          <div className="mt-5 space-y-2">
            <Muted>{detail ?? step.blurb}</Muted>
            {step.due && state !== "done" && state !== "locked" && (
              <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-900">
                {deadlineLabel(step.due)}
              </p>
            )}
          </div>
        </section>

        <div className="border-t border-neutral-200 py-14">{children}</div>

        <nav className="grid gap-px border-y border-neutral-200 bg-neutral-200 sm:grid-cols-2">
          <StepLink base={base} step={prev} direction="prev" linkTo={linkTo} />
          <StepLink base={base} step={next} direction="next" linkTo={linkTo} />
        </nav>

        <SiteFooter />
      </Container>
    </main>
  );
}

function StepLink({
  base,
  step,
  direction,
  linkTo,
}: {
  base: string;
  step?: StepDefinition;
  direction: "prev" | "next";
  linkTo: (href: string) => string;
}) {
  if (!step) return <span className="bg-white" />;
  const isNext = direction === "next";
  return (
    <Link
      href={linkTo(`${base}/${step.slug}`)}
      className={`group bg-white p-6 transition-colors hover:bg-neutral-50 ${
        isNext ? "sm:text-right" : ""
      }`}
    >
      <span className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
        {isNext ? "Next step" : "Previous step"}
      </span>
      <span className="mt-2 block text-[15px] font-medium">
        {!isNext && (
          <span
            aria-hidden="true"
            className="mr-2 inline-block text-neutral-300 transition-transform group-hover:-translate-x-1 group-hover:text-neutral-900"
          >
            ←
          </span>
        )}
        {step.title}
        {isNext && (
          <span
            aria-hidden="true"
            className="ml-2 inline-block text-neutral-300 transition-transform group-hover:translate-x-1 group-hover:text-neutral-900"
          >
            →
          </span>
        )}
      </span>
    </Link>
  );
}
