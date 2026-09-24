import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CardDeck, type DeckCard } from "@/components/intro/card-deck";

export const metadata: Metadata = {
  title: "Siftag Pop-Up at Fabrica X",
  description:
    "The Natural Fibre Edit: Siftag's pop-up at Fabrica X, King's Cross, 25 to 27 September 2026. Preview what's inside, or buy online and collect at the counter.",
  robots: { index: false, follow: false },
};

/** The vendor cards (public/intro/cards) and which brand each opens in the shop. */
const BRAND_CARDS: Array<{ file: string; brand: string }> = [
  { file: "aefen", brand: "Aefen London" },
  { file: "house", brand: "House of Ador" },
  { file: "hyli", brand: "Hyli" },
  { file: "india-grace", brand: "India Grace London" },
  { file: "julie", brand: "Julie May Lingerie" },
  { file: "laine", brand: "Laine Hill" },
  { file: "margen", brand: "Margen Atelier" },
  { file: "plain", brand: "Plain and Simple" },
  { file: "sariva", brand: "Sariva Rozen" },
  { file: "valentina", brand: "Valentina Karellas" },
  { file: "yusun", brand: "Yusun The Label" },
];

/**
 * The front door: the line-up as a deck of cards, and the few words a
 * shopper needs before buying here rather than in the room: no trying on,
 * no returns.
 */
export default function IntroPage() {
  const cards: DeckCard[] = BRAND_CARDS.map((c) => ({
    src: `/intro/cards/${c.file}.jpg`,
    alt: `${c.brand} uses no polyester`,
    href: `/popup?brand=${encodeURIComponent(c.brand)}`,
  }));

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center px-6 py-10 text-center md:py-14">
        <Link href="/popup" aria-label="Enter the Siftag pop-up shop">
          <Image src="/SiftagLogo.png" alt="Siftag" width={160} height={53} className="h-auto w-[140px] md:w-[160px]" priority />
        </Link>
        <p className="mt-5 text-[11px] uppercase tracking-[0.25em] text-gray-500">The Natural Fibre Edit · Fabrica X, King&apos;s Cross · 25–27 September</p>

        <div className="mt-8 w-full">
          <CardDeck cards={cards} />
        </div>

        <div className="mt-10 max-w-sm space-y-2 text-sm leading-relaxed text-gray-600">
          <p>Siftag is the first and largest polyester-free fashion platform. This is a preview of what&apos;s inside Fabrica X this weekend.</p>
          <p>Sure of your size? Buy online and collect at the Express counter. Want to try it on? Come and visit.</p>
        </div>

        <Link
          href="/popup"
          className="mt-7 inline-flex items-center justify-center rounded-full bg-gray-900 px-8 py-3 text-[11px] uppercase tracking-[0.2em] text-white transition-colors hover:bg-gray-800"
        >
          Enter the pop-up
        </Link>
        <p className="mt-5 text-[10px] uppercase tracking-[0.2em] text-gray-400">
          All sales are final · 36–40 York Way, N1 9AB · 9am–6pm · free entry
        </p>
      </div>
    </main>
  );
}
