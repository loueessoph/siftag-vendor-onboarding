import Link from "next/link";
import type { DemoScenario } from "@/lib/demo";

const SCENARIOS: { key: DemoScenario; label: string }[] = [
  { key: "new", label: "Just paid" },
  { key: "signed", label: "Signed" },
  { key: "returning", label: "Fourth visit" },
  { key: "submitted", label: "List submitted" },
];

/**
 * Review-only. The design turns on the same page reading differently as a
 * brand progresses, which is impossible to judge from one screenshot — so all
 * three states are reachable without a database. Delete with lib/demo.ts.
 */
export function DemoSwitcher({
  base,
  scenario,
}: {
  base: string;
  scenario: DemoScenario;
}) {
  return (
    <div className="border-t border-dashed border-neutral-300 py-8">
      <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
        Preview only · not shown to vendors
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <Link
            key={s.key}
            href={`${base}?state=${s.key}`}
            className={`border px-4 py-2 text-[11px] uppercase tracking-[0.15em] transition-colors ${
              s.key === scenario
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-500 hover:border-neutral-900 hover:text-neutral-900"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
