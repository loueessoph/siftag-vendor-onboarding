import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import fs from "node:fs/promises";
import path from "node:path";

export const metadata: Metadata = {
  title: "Siftag Pop-Up at Fabrica X",
  description:
    "The Natural Fibre Edit: Siftag's pop-up at Fabrica X, King's Cross, 25 to 27 September 2026. Preview what's inside, or buy online and collect at the counter.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic"; // a different poster each load

/** Any image dropped into public/intro is a candidate; one is picked per visit. */
async function randomPoster(): Promise<string> {
  try {
    const files = (await fs.readdir(path.join(process.cwd(), "public", "intro"))).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    if (files.length === 0) return "/fabrica-x.jpg";
    return `/intro/${files[Math.floor(Math.random() * files.length)]}`;
  } catch {
    return "/fabrica-x.jpg";
  }
}

/**
 * The front door. What Siftag is, what this pop-up is, and the one thing a
 * shopper has to understand before they buy here rather than in the room:
 * no trying on, no returns.
 */
export default async function IntroPage() {
  const poster = await randomPoster();
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-2">
        <div className="relative aspect-square w-full lg:aspect-auto lg:min-h-screen">
          <Image src={poster} alt="Siftag at Fabrica X: The Natural Fibre Edit, 25 to 27 September" fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
        </div>

        <div className="flex flex-col justify-center px-6 py-10 md:px-12 lg:py-16">
          <Image src="/SiftagLogo.png" alt="Siftag" width={100} height={33} className="h-auto w-[90px]" />
          <p className="mt-8 text-[11px] uppercase tracking-[0.25em] text-gray-500">The Natural Fibre Edit</p>
          <h1 className="mt-3 font-display text-3xl leading-tight md:text-4xl">
            A weekend of clothes with nothing synthetic in them.
          </h1>

          <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-gray-600">
            <p>
              Siftag is the first and largest polyester-free fashion platform. Every piece we list is made from natural fibres, cotton, linen, silk, wool and cashmere, and nothing else. For three days we&apos;re bringing that edit off the screen and into Fabrica X in King&apos;s Cross, with independent brands, a café, exclusive merch and free entry.
            </p>
            <p>
              <span className="font-medium text-gray-900">This site is a preview of what&apos;s inside.</span> Browse everything on the rails right now, with live stock by size.
            </p>
            <p>
              If you already know what you want and you&apos;re happy to buy without trying it on, you can buy it here: pay online, then collect it from the Express counter at Fabrica X. If you&apos;d like to try things on first, come and visit us; that&apos;s what the weekend is for.
            </p>
            <p className="text-sm text-gray-500">All sales are final. Nothing bought online or at the counter can be returned or exchanged.</p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/popup"
              className="inline-flex items-center justify-center rounded-full bg-gray-900 px-8 py-3.5 text-xs uppercase tracking-widest text-white transition-colors hover:bg-gray-800"
            >
              Enter the pop-up
            </Link>
            <span className="text-xs text-gray-400">Free entry · no account needed</span>
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-gray-100 pt-6 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-widest text-gray-500">When</dt>
              <dd className="mt-1 text-gray-900">Fri 25 to Sun 27 September, 9am to 6pm</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-widest text-gray-500">Where</dt>
              <dd className="mt-1 text-gray-900">Fabrica X, 36–40 York Way, King&apos;s Cross, London N1 9AB</dd>
            </div>
          </dl>
        </div>
      </div>
    </main>
  );
}
