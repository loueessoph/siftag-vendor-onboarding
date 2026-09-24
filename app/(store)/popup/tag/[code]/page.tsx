import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { sized } from "@/lib/images";
import { ChevronLeft } from "lucide-react";
import { AddToBag } from "@/components/store/add-to-bag";
import { FabricComposition } from "@/components/store/fabric-composition";
import { getTagDetail } from "@/lib/browse";
import type { UnitStatus } from "@/lib/live-event";

export const dynamic = "force-dynamic"; // status must always be live, never statically cached

interface Props {
  params: Promise<{ code: string }>;
}

const STATUS_LABEL: Record<UnitStatus | "sold_out", string> = {
  available: "Available",
  held: "Held",
  fitting_room: "In fitting room",
  sold: "Sold",
  sold_out: "Sold out",
};

const STATUS_DOT: Record<UnitStatus | "sold_out", string> = {
  available: "bg-green-500",
  held: "bg-amber-500",
  fitting_room: "bg-blue-500",
  sold: "bg-neutral-400",
  sold_out: "bg-neutral-400",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const detail = await getTagDetail(code);
  if (!detail) return { title: "Tag not found | Siftag Pop-Up" };
  return {
    title: `${detail.product.title} — ${detail.brand.name} | Siftag Pop-Up`,
    robots: { index: false, follow: false },
  };
}

/**
 * What a shopper sees scanning the QR on a garment's own tag: this exact
 * unit's size/status up top, plus every other size's live availability.
 */
export default async function PopupTagPage({ params }: Props) {
  const { code } = await params;
  const detail = await getTagDetail(code);
  if (!detail) notFound();

  const { unit, product, brand, price_gbp, sizes } = detail;
  // The scanned garment is one specific unit; make it the pre-selected size.
  const sizeOptions = sizes.map((s) =>
    (s.size ?? "") === (unit.size ?? "")
      ? { ...s, status: unit.status, buy_unit_code: unit.status === "available" ? unit.code : s.buy_unit_code }
      : s
  );

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-2 md:px-6 md:pt-6">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-xs tracking-widest text-gray-500 hover:text-gray-900">
        <ChevronLeft className="h-4 w-4" /> ALL ITEMS
      </Link>
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-gray-200">
          {product.image_urls[0] ? (
            <Image src={sized(product.image_urls[0], 1200)} alt={product.title} fill priority sizes="(max-width: 768px) 100vw, 50vw" className="object-cover object-top" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">No photo yet</div>
          )}
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium shadow-sm">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[unit.status]}`} />
            {STATUS_LABEL[unit.status]}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-400">{brand.name}</p>
            <h1 className="mt-2 text-xl uppercase tracking-wide text-gray-900">{product.title}</h1>
            <p className="mt-3 text-xl text-gray-900">{price_gbp != null ? `£${Number(price_gbp).toFixed(2)}` : "—"}</p>
            <p className="mt-2 text-xs text-gray-400">
              {[unit.colour, `Tag ${unit.code}`].filter(Boolean).join(" · ")}
            </p>
          </div>

          <FabricComposition composition={product.fibre_composition} />

          {unit.status !== "available" && (
            <div className="rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-600">
              This exact piece is currently {STATUS_LABEL[unit.status].toLowerCase()}. Another size may be free below, or ask floor staff.
            </div>
          )}

          <AddToBag
            product={{
              productId: product.id,
              title: product.title,
              brandName: brand.name,
              colour: unit.colour,
              priceGbp: Number(price_gbp ?? 0),
              imageUrl: product.image_urls[0] ?? null,
            }}
            sizes={sizeOptions}
            preselect={unit.status === "available" ? { unitCode: unit.code, size: unit.size } : null}
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
