/**
 * Segmented rather than continuous: six discrete things are owed, and a
 * smooth bar would imply a percentage nobody can act on. Filled segments are
 * ink, the rest are hairline — no colour, in keeping with the rest of the site.
 */
export function ProgressBar({
  done,
  total,
}: {
  done: number;
  total: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          Your progress
        </span>
        <span className="text-[11px] uppercase tracking-[0.2em] text-neutral-900">
          {done} of {total} done
        </span>
      </div>
      <div
        className="mt-3 flex gap-1"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${done} of ${total} steps done`}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 ${
              i < done ? "bg-neutral-900" : "bg-neutral-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
