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
    <main className="h-dvh overflow-y-auto bg-white text-gray-900">
      {/* Sized to the viewport: the deck is scaled from the height so the whole page fits without scrolling
          on a phone or a laptop; only a very short window would need to scroll. */}
      <div
        className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center px-6 py-4 text-center"
        style={{ ["--deck-w" as string]: "min(360px, 82vw, 35dvh)" }}
      >
        <Link href="/popup" aria-label="Enter the Siftag pop-up shop">
          <Image src="/SiftagLogo.png" alt="Siftag" width={160} height={53} className="h-auto w-[110px] md:w-[140px]" priority />
        </Link>
        <p className="mt-2 text-[10px] uppercase tracking-[0.25em] text-gray-500 md:text-[11px]">The Natural Fibre Edit · 25–27 September</p>

        <div className="mt-3 w-full">
          <CardDeck cards={cards} />
        </div>

        <p className="mt-3 max-w-xs text-[13px] leading-snug text-gray-600 md:text-sm">
          The first and largest polyester-free platform. Buy online and collect at Fabrica X, or come and try it on.
        </p>

        <Link
          href="/popup"
          className="mt-4 inline-flex items-center justify-center rounded-full bg-gray-900 px-8 py-2.5 text-[11px] uppercase tracking-[0.2em] text-white transition-colors hover:bg-gray-800"
        >
          Enter the pop-up
        </Link>
        <p className="mt-2.5 text-[9px] uppercase tracking-[0.2em] text-gray-400 md:text-[10px]">All sales are final</p>
      </div>
    </main>
  );
}
