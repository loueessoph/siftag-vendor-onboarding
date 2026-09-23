import { getBrowseCatalogue } from "@/lib/browse";
import { ShopClient } from "./shop-client";

export const dynamic = "force-dynamic"; // live status, never statically cached
export const metadata = { title: "Siftag Pop-Up", robots: { index: false, follow: false } };

export default async function PopupBrowsePage() {
  const products = await getBrowseCatalogue();

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-normal tracking-widest uppercase text-gray-600 mb-6">Siftag Pop-Up</h1>
        <ShopClient initialProducts={products} />
      </div>
    </main>
  );
}
