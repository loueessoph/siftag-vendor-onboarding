import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { AddToBag } from "@/components/store/add-to-bag";
import { getProductDetail } from "@/lib/browse";

export const dynamic = "force-dynamic"; // status must always be live, never statically cached

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await getProductDetail(id);
  if (!detail) return { title: "Product not found | Siftag Pop-Up" };
  return {
    title: `${detail.product.title} — ${detail.brand.name} | Siftag Pop-Up`,
    robots: { index: false, follow: false },
  };
}

/**
 * Product-level detail page for a shopper arriving from the browse-all page
 * (clicked a card, didn't scan a garment's tag). Unlike /popup/tag/[code],
 * no single unit/size is implied as already chosen — every size is shown
 * as an equal option in the grid below.
 */
export default async function PopupProductPage({ params }: Props) {
  const { id } = await params;
  const detail = await getProductDetail(id);
  if (!detail) notFound();

  const { product, brand, price_gbp, sizes } = detail;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-2 md:px-6 md:pt-6">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-xs tracking-widest text-gray-500 hover:text-gray-900">
        <ChevronLeft className="h-4 w-4" /> ALL ITEMS
      </Link>
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        {/* Photos */}
        <div className="space-y-3">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-gray-200">
            {product.image_urls[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image_urls[0]} alt={product.title} className="h-full w-full object-cover object-top" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">No photo yet</div>
            )}
          </div>
          {product.image_urls.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {product.image_urls.slice(1, 5).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt={`${product.title} ${i + 2}`} className="aspect-[3/4] w-full rounded-md object-cover object-top" />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-400">{brand.name}</p>
            <h1 className="mt-1 text-2xl text-gray-900 font-display">{product.title}</h1>
            <p className="mt-2 text-lg text-gray-900">{price_gbp != null ? `£${Number(price_gbp).toFixed(2)}` : "—"}</p>
            {product.fibre_composition && <p className="mt-1 text-sm text-gray-500">{product.fibre_composition}</p>}
          </div>

          <AddToBag
            product={{
              productId: product.id,
              title: product.title,
              brandName: brand.name,
              colour: null,
              priceGbp: Number(price_gbp ?? 0),
              imageUrl: product.image_urls[0] ?? null,
            }}
            sizes={sizes}
          />

          {(brand.story || brand.instagram_handle) && (
            <section className="space-y-2 border-t border-gray-100 pt-5">
              <h2 className="text-xs uppercase tracking-widest text-gray-500">About {brand.name}</h2>
              {brand.story && <p className="text-sm text-gray-600">{brand.story}</p>}
              {brand.instagram_handle && (
                <a
                  href={`https://instagram.com/${brand.instagram_handle.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-500 underline"
                >
                  @{brand.instagram_handle.replace(/^@/, "")}
                </a>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
