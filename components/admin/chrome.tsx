import { PickupBadge } from "./pickup-badge";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { readSession } from "@/lib/admin-session";
import { homeFor } from "@/lib/admin-auth";

const ADMIN_NAV = [
  { href: "/admin", label: "Brands" },
  { href: "/admin/approvals", label: "Approvals" },
  { href: "/admin/items", label: "Item lookup" },
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/staff", label: "Floor staff briefing" },
  { href: "/admin/till", label: "Checkout" },
  { href: "/admin/pickup", label: "Order pickup" },
];

/** What a floor-staff account can reach: the console and the till. */
const STAFF_NAV = [
  { href: "/admin/staff", label: "Floor staff briefing" },
  { href: "/admin/items", label: "Item lookup" },
  { href: "/admin/till", label: "Checkout" },
  { href: "/admin/pickup", label: "Order pickup" },
];

export async function AdminShell({
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
  const session = await readSession();
  const isStaff = session?.role === "staff";
  const home = homeFor(session?.role ?? "admin");
  const nav = isStaff ? STAFF_NAV : ADMIN_NAV;
  const defaultBack = isStaff ? null : { href: "/admin", label: "All brands" };
  const backTo = back === null ? null : back ?? defaultBack;
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto max-w-admin overflow-x-hidden px-6">
        {/*
          On a phone the five links can't share a row with the logo, so they
          drop to a row of their own that scrolls sideways; the page itself
          never gets wider than the screen. Desktop keeps the single row.
        */}
        <header className="border-b border-neutral-200 py-4 lg:py-5">
          <div className="flex items-center justify-between gap-4">
            <Link href={home} aria-label="Siftag pop-up admin" className="shrink-0">
              <Image src="/SiftagLogo.png" alt="Siftag" width={90} height={29} priority className="h-auto w-[72px] lg:w-[90px]" />
            </Link>
            <nav className="hidden items-center gap-6 text-[11px] uppercase tracking-[0.2em] lg:flex">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="whitespace-nowrap text-neutral-500 transition-colors hover:text-neutral-900">
                  {item.label}
                  {item.href === "/admin/pickup" && <PickupBadge />}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-4 text-[11px] uppercase tracking-[0.2em] text-neutral-400">
              <span className="hidden xl:inline">Fabrica X · Sept 2026</span>
              {session && (
                <form action="/api/admin/logout" method="post" className="flex items-center gap-3">
                  <span className="text-neutral-500">{session.name}</span>
                  <button type="submit" className="underline underline-offset-4 transition-colors hover:text-neutral-900">
                    Sign out
                  </button>
                </form>
              )}
            </div>
          </div>
          <nav className="-mx-6 mt-3 flex gap-6 overflow-x-auto px-6 text-[11px] uppercase tracking-[0.2em] lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="whitespace-nowrap py-1 text-neutral-500 transition-colors hover:text-neutral-900">
                {item.label}
                {item.href === "/admin/pickup" && <PickupBadge />}
              </Link>
            ))}
          </nav>
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

        <div className={`flex flex-wrap items-end justify-between gap-6 pb-8 lg:pb-10 ${backTo ? "pt-6" : "pt-8 lg:pt-12"}`}>
          <div>
            {eyebrow && (
              <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
                {eyebrow}
              </p>
            )}
            <h1 className="mt-2 font-display text-2xl sm:text-3xl lg:text-4xl">{title}</h1>
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
