/**
 * Stand-in data so the vendor flow can be reviewed before Supabase is wired
 * up. Four scenarios, switched with ?state= on the hub, because the whole
 * point of this design is that the same page reads differently depending on
 * how far a brand has got. Delete this file once the real queries exist.
 */

import type { VendorProgress } from "./steps";

export type DemoScenario = "new" | "signed" | "returning" | "submitted";

export const DEMO_BRAND = {
  name: "India Grace London",
  contactName: "India",
  legalName: "India Grace London Ltd",
  feeGbp: 175,
  feeLabel: "£175",
  feePaidOn: "2 August",
  commissionPct: 10,
  catalogueSize: 46,
};

export const DEMO_PROGRESS: Record<DemoScenario, VendorProgress> = {
  // Straight from the payment confirmation email. Nothing signed yet.
  new: {
    agreement: { state: "todo" },
    products: { state: "todo" },
    stock: { state: "todo" },
    marketing: { state: "todo" },
  },
  // Signed, but hasn't started the list.
  signed: {
    agreement: { state: "done", detail: "Signed 18 August by India Grace" },
    products: { state: "todo" },
    stock: { state: "todo" },
    marketing: { state: "todo" },
  },
  // Fourth visit. The list is most of the way there and the gaps are named.
  returning: {
    agreement: { state: "done", detail: "Signed 18 August by India Grace" },
    products: {
      state: "in_progress",
      detail: "12 items selected · 3 still need fibre composition",
    },
    stock: { state: "todo" },
    marketing: { state: "in_progress", detail: "1 of 3 posts shared" },
  },
  // List submitted and frozen; the weekend is what's left.
  submitted: {
    agreement: { state: "done", detail: "Signed 18 August by India Grace" },
    products: {
      state: "locked",
      detail: "18 items submitted 1 September · 16 approved, 2 pending",
    },
    stock: { state: "in_progress", detail: "2 of 3 boxes received" },
    marketing: { state: "in_progress", detail: "1 of 3 posts shared" },
  },
};

export function isDemoScenario(value: unknown): value is DemoScenario {
  return (
    value === "new" ||
    value === "signed" ||
    value === "returning" ||
    value === "submitted"
  );
}

/**
 * Keeps the chosen scenario attached as you click around, so "first visit"
 * stays a first visit once you're inside a step. Goes away with the fixtures.
 */
export function demoHref(path: string, scenario: DemoScenario): string {
  return `${path}?state=${scenario}`;
}
