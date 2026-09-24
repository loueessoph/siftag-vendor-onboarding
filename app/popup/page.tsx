import Image from "next/image";
import { getBrowseCatalogue } from "@/lib/browse";
import { ShopClient } from "./shop-client";

export const dynamic = "force-dynamic"; // live status, never statically cached
export const metadata = { title: "Siftag Pop-Up", robots: { index: false, follow: false } };

export default async function PopupBrowsePage() {
  const products = await getBrowseCatalogue();

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Image
            src="/SiftagLogo.png"
            alt="Siftag"
            width={100}
            height={33}
            priority
            className="w-[100px] md:w-[120px] h-auto"
          />
          <p className="mt-2 text-xs uppercase tracking-widest text-gray-400">Pop-Up</p>
        </div>
        <ShopClient initialProducts={products} />
      </div>
    </main>
  );
}
