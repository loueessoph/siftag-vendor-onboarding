import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function AdminShell({
  title,
  eyebrow,
  action,
  back,
  children,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  /** Where "back" goes from this page. Defaults to the brands list; null hides it. */
  back?: { href: string; label: string } | null;
  children: ReactNode;
}) {
  const backTo = back === null ? null : back ?? { href: "/admin", label: "All brands" };
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto max-w-admin px-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 py-5">
          <nav className="flex items-center gap-6 text-[11px] uppercase tracking-[0.2em]">
            <Link href="/admin" aria-label="Siftag pop-up admin" className="shrink-0">
              <Image src="/SiftagLogo.png" alt="Siftag" width={90} height={29} priority className="h-[29px] w-[90px]" />
            </Link>
            <Link href="/admin" className="text-neutral-500 transition-colors hover:text-neutral-900">
              Brands
            </Link>
            <Link href="/admin/approvals" className="text-neutral-500 transition-colors hover:text-neutral-900">
              Approvals
            </Link>
            <Link href="/admin/dashboard" className="text-neutral-500 transition-colors hover:text-neutral-900">
              Dashboard
            </Link>
            <Link href="/admin/staff" className="text-neutral-500 transition-colors hover:text-neutral-900">
              Floor staff
            </Link>
          </nav>
          <span className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
            Fabrica X · Sept 2026
          </span>
        </header>

        {backTo && (
          <div className="pt-8">
            <Link
              href={backTo.href}
              className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 transition-colors hover:text-neutral-900"
            >
              <span aria-hidden="true">←</span> {backTo.label}
            </Link>
          </div>
        )}

        <div className={`flex flex-wrap items-end justify-between gap-6 pb-10 ${backTo ? "pt-6" : "pt-12"}`}>
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
