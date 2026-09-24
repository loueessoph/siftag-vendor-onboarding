import { getBrowseCatalogue } from "@/lib/browse";
import { ShopClient, type Section } from "./shop-client";

export const dynamic = "force-dynamic"; // live status, never statically cached
export const metadata = { title: "Siftag Pop-Up", robots: { index: false, follow: false } };

const SECTIONS: Section[] = ["all", "women", "men", "accessories"];

interface Props {
  searchParams?: Promise<{ section?: string }>;
}

export default async function PopupBrowsePage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const section = SECTIONS.includes(params.section as Section) ? (params.section as Section) : "all";
  const products = await getBrowseCatalogue();

  return (
    <main className="mx-auto max-w-7xl px-4 pb-10 md:px-6">
      <ShopClient initialProducts={products} section={section} />
    </main>
  );
}
