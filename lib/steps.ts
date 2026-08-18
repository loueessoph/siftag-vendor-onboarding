/**
 * The four things a brand does after paying.
 *
 * Payment happens before any of this, on the reservation site, and is not a
 * step here — a brand only ever reaches this app from the emailed link they
 * get once their fee has gone through. It shows on the hub as settled context
 * rather than as something to chase.
 *
 * Deliberately not a wizard. Brands come back three or four times over several
 * weeks and the product list is the slow one — someone who can't count stock
 * yet must still be able to do their marketing posts. Every step is openable
 * at any time; the numbering conveys order, not a gate.
 */

import { KEY_DATES } from "./dates";

export type StepState =
  /** Finished. */
  | "done"
  /** Started, not finished. Carries a detail line saying what's left. */
  | "in_progress"
  /** Not started. */
  | "todo"
  /** Finished and frozen — the product list after submit. */
  | "locked";

export type StepSlug = "agreement" | "products" | "stock" | "marketing";

export type StepDefinition = {
  n: string;
  slug: StepSlug;
  title: string;
  /** Shown when the step has no state-specific detail of its own. */
  blurb: string;
  due?: string;
  /**
   * Tie-break for the next-action card. The agreement has no calendar
   * deadline but gates everything else, so it outranks dated steps until
   * it's signed.
   */
  priority: number;
};

export const STEPS: StepDefinition[] = [
  {
    n: "01",
    slug: "agreement",
    title: "Sign your agreement",
    blurb: "The vendor terms for the weekend. Read it, sign at the bottom.",
    priority: 0,
  },
  {
    n: "02",
    slug: "products",
    title: "Send us your product list",
    blurb: "Pick what you're bringing from your own catalogue.",
    due: KEY_DATES.productList,
    priority: 1,
  },
  {
    n: "03",
    slug: "stock",
    title: "Get your stock to us",
    blurb: "Ship it to the venue or bring it on set-up day.",
    due: KEY_DATES.stockArrival,
    priority: 2,
  },
  {
    n: "04",
    slug: "marketing",
    title: "Posts and the weekend",
    blurb:
      "Your 3 posts before doors open, and whether you're working your space.",
    due: KEY_DATES.setUp,
    priority: 3,
  },
];

export type StepStatus = {
  state: StepState;
  /**
   * What is actually outstanding, in the brand's own numbers. This is the
   * line that makes a fourth visit read differently from a first, so it beats
   * the generic blurb wherever it exists.
   */
  detail?: string;
};

export type VendorProgress = Record<StepSlug, StepStatus>;

export function stepsWithStatus(progress: VendorProgress) {
  return STEPS.map((step) => ({ ...step, ...progress[step.slug] }));
}

/** The single thing to put at the top of the hub. */
export function nextAction(progress: VendorProgress) {
  return (
    stepsWithStatus(progress)
      .filter((s) => s.state !== "done" && s.state !== "locked")
      .sort((a, b) => a.priority - b.priority)[0] ?? null
  );
}

export function completedCount(progress: VendorProgress): number {
  return Object.values(progress).filter(
    (s) => s.state === "done" || s.state === "locked"
  ).length;
}
