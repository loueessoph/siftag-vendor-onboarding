import { getBrowseCatalogue } from "@/lib/browse";
import { ShopClient, type Section } from "./shop-client";

export const dynamic = "force-dynamic"; // live status, never statically cached
export const metadata = {
  title: "Siftag Pop-Up at Fabrica X",
  description:
    "Shop natural-fibre pieces from independent brands at the Siftag pop-up, Fabrica X, King's Cross, 25 to 27 September 2026. Pay online, collect at the counter.",
  robots: { index: false, follow: false },
};

const SECTIONS: Section[] = ["all", "women", "men", "accessories"];

interface Props {
  /** `brand` comes from a tap on a card on the intro page. */
  searchParams?: Promise<{ section?: string; brand?: string }>;
}

export default async function PopupBrowsePage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const section = SECTIONS.includes(params.section as Section) ? (params.section as Section) : "all";
  const products = await getBrowseCatalogue();
  const brand = params.brand && products.some((p) => p.brandName === params.brand) ? params.brand : "all";

  return (
    <main className="mx-auto max-w-7xl px-4 pb-10 md:px-6">
      <ShopClient initialProducts={products} section={section} initialBrand={brand} />
    </main>
  );
}
