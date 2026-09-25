import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { staffLinkValid, staffNames } from "@/lib/admin-auth";

export const metadata: Metadata = { title: "Floor staff: Siftag pop-up", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The floor team's link. One tap on your name and you're in for the whole
 * event; the name is what the till and the status buttons log you as.
 */
export default async function StaffEntry({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await staffLinkValid(token))) notFound();
  const names = staffNames();

  return (
    <main className="min-h-dvh bg-white text-neutral-900">
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
        <Image src="/SiftagLogo.png" alt="Siftag" width={90} height={29} className="h-auto w-[90px]" priority />
        <p className="mt-10 text-[11px] uppercase tracking-[0.2em] text-neutral-500">Fabrica X · floor staff</p>
        <h1 className="mt-2 font-display text-3xl">Who are you?</h1>
        <p className="mt-2 text-sm text-neutral-500">Tap your name. You stay signed in on this phone for the whole event.</p>
        <form method="post" action={`/staff/${token}/as`} className="mt-8 grid gap-3">
          {names.map((name) => (
            <button
              key={name}
              type="submit"
              name="name"
              value={name}
              className="w-full rounded-full border border-neutral-900 py-4 text-sm uppercase tracking-[0.2em] transition-colors hover:bg-neutral-900 hover:text-white"
            >
              {name}
            </button>
          ))}
        </form>
      </div>
    </main>
  );
}
