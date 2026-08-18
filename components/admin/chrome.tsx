import Link from "next/link";
import type { ReactNode } from "react";

export function AdminShell({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto max-w-admin px-6">
        <header className="flex items-center justify-between border-b border-neutral-200 py-5">
          <Link
            href="/admin"
            className="text-[11px] uppercase tracking-[0.2em] transition-colors hover:text-neutral-500"
          >
            Siftag pop-up admin
          </Link>
          <span className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
            Fabrica X · Sept 2026
          </span>
        </header>

        <div className="flex flex-wrap items-end justify-between gap-6 pt-12 pb-10">
          <div>
            {eyebrow && (
              <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
                {eyebrow}
              </p>
            )}
            <h1 className="mt-2 font-display text-3xl lg:text-4xl">{title}</h1>
          </div>
          {action}
        </div>

        {children}

        <div className="py-16" />
      </div>
    </main>
  );
}

/** Reusable "nothing here yet" state, so empty screens still explain themselves. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="border border-dashed border-neutral-300 px-6 py-16 text-center">
      <p className="text-sm leading-relaxed text-neutral-500">{children}</p>
    </div>
  );
}
