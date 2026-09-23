import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Pill } from "@/components/ui";
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

  return (
    <main className="min-h-screen bg-white pb-16">
      <div className="mx-auto max-w-md">
        {/* Photo */}
        <div className="relative aspect-[4/5] w-full bg-neutral-100 overflow-hidden">
          {product.image_urls[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image_urls[0]} alt={product.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-neutral-400 text-sm">No photo yet</div>
          )}
          <Link
            href="/popup"
            aria-label="Back to all items"
            className="absolute top-3 left-3 flex items-center justify-center h-8 w-8 rounded-full bg-white/90 shadow-sm hover:bg-white transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 text-neutral-900">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium shadow-sm">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[unit.status]}`} />
            {STATUS_LABEL[unit.status]}
          </div>
        </div>

        <div className="px-5 pt-5 space-y-6">
          {/* Title / brand / price */}
          <div>
            <p className="text-xs uppercase tracking-widest text-neutral-500">{brand.name}</p>
            <h1 className="text-xl font-display text-neutral-900 mt-1">{product.title}</h1>
            <div className="mt-2 flex items-baseline gap-2">
              {price_gbp != null && <span className="text-lg text-neutral-900">£{Number(price_gbp).toFixed(2)}</span>}
              {unit.size && <span className="text-sm text-neutral-500">Size {unit.size}</span>}
              {unit.colour && <span className="text-sm text-neutral-500">· {unit.colour}</span>}
            </div>
          </div>

          {/* Buy CTA for the scanned unit */}
          {unit.status === "available" ? (
            <Link
              href={`/popup/express?code=${code.toUpperCase()}`}
              className="block w-full text-center rounded-full bg-black text-white py-3 text-sm tracking-wide uppercase hover:bg-neutral-800 transition-colors"
            >
              Buy now — collect at Express counter
            </Link>
          ) : (
            <div className="rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
              This exact piece is currently {STATUS_LABEL[unit.status].toLowerCase()}. Check other sizes below, or
              ask floor staff.
            </div>
          )}

          {/* Composition & care */}
          {(product.fibre_composition || product.care_notes || product.sizing_notes) && (
            <section className="border-t border-neutral-200 pt-5 space-y-3">
              <h2 className="text-xs uppercase tracking-widest text-neutral-500">Composition &amp; care</h2>
              {product.fibre_composition && (
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm text-neutral-900">{product.fibre_composition}</p>
                  {product.natural_fibre_pct != null && (
                    <Pill>{Number(product.natural_fibre_pct)}% natural fibres</Pill>
                  )}
                </div>
              )}
              {product.care_notes && <p className="text-sm text-neutral-600">{product.care_notes}</p>}
              {product.sizing_notes && <p className="text-sm text-neutral-500 italic">{product.sizing_notes}</p>}
            </section>
          )}

          {/* Brand story */}
          {(brand.story || brand.logo_url) && (
            <section className="border-t border-neutral-200 pt-5 space-y-3">
              <h2 className="text-xs uppercase tracking-widest text-neutral-500">About {brand.name}</h2>
              <div className="flex items-start gap-3">
                {brand.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={brand.logo_url}
                    alt={brand.name}
                    className="h-10 w-10 rounded-full object-cover border border-neutral-200"
                  />
                )}
                <div className="space-y-1">
                  {brand.story && <p className="text-sm text-neutral-700">{brand.story}</p>}
                  {brand.instagram_handle && (
                    <a
                      href={`https://instagram.com/${brand.instagram_handle.replace(/^@/, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-neutral-500 underline"
                    >
                      @{brand.instagram_handle.replace(/^@/, "")}
                    </a>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Other sizes */}
          {sizes.length > 1 && (
            <section className="border-t border-neutral-200 pt-5 space-y-3">
              <h2 className="text-xs uppercase tracking-widest text-neutral-500">
                Other sizes — live availability
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {sizes.map((s) => {
                  const isBuyable = s.status === "available" && s.buy_unit_code;
                  const content = (
                    <div
                      className={`rounded-lg border px-3 py-2.5 text-center transition-colors ${
                        isBuyable ? "border-neutral-900 hover:bg-neutral-50" : "border-neutral-200 text-neutral-400"
                      }`}
                    >
                      <p className="text-sm font-medium text-neutral-900">{s.size ?? "—"}</p>
                      <p className="text-[11px] mt-0.5 flex items-center justify-center gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s.status]}`} />
                        {STATUS_LABEL[s.status]}
                        {s.status === "available" && s.available_count > 1 ? ` · ${s.available_count}` : ""}
                      </p>
                    </div>
                  );
                  return isBuyable ? (
                    <Link key={s.size ?? "unsized"} href={`/popup/express?code=${s.buy_unit_code}`}>
                      {content}
                    </Link>
                  ) : (
                    <div key={s.size ?? "unsized"}>{content}</div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
