import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Eyebrow, Muted, PageHeading, Section } from "@/components/ui";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { vendorPath } from "@/lib/brands";
import { getVendorByToken } from "@/lib/vendor";
import { getVendorSalesReport } from "@/lib/vendor-sales";
import { money } from "@/lib/format";
import Image from "next/image";
import { sized } from "@/lib/images";
import { PhotoPlaceholder } from "@/components/store/photo-placeholder";

export const metadata: Metadata = {
  title: "Your sales: Siftag at Fabrica X",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TIME = new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/**
 * The brand's sales report: the money first, then what sold and what's
 * left size by size, then the weekend day by day, then every sale. Reads
 * live; nothing here is final until the settlement after the event.
 */
export default async function VendorSalesPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { token } = await params;
  const context = await getVendorByToken(token);
  if (!context) notFound();
  const { brand } = context;
  const base = vendorPath(brand.slug, token);
  const report = await getVendorSalesReport(brand.id);

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <Container>
        <SiteHeader />

        <Section first>
          <Link href={base} className="text-xs uppercase tracking-[0.2em] text-neutral-500 underline underline-offset-4 hover:text-neutral-900">
            ← Your page
          </Link>
          <div className="mt-6">
            <Eyebrow>Siftag at Fabrica X</Eyebrow>
            <PageHeading>Your sales</PageHeading>
          </div>
          <div className="mt-3">
            <Muted>
              {report.unitsSold === 0
                ? "Nothing's sold yet. This page updates live once the doors open."
                : "Live from the till and the online checkout. Figures are finalised in your settlement after the event."}
            </Muted>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-neutral-200 py-8 sm:grid-cols-4">
            <Stat label="Units sold" value={String(report.unitsSold)} note={`of ${report.unitsTotal} on the rail`} />
            <Stat label="Revenue" value={money(report.grossGbp)} />
            <Stat label="Estimated payout" value={money(report.netPayableGbp)} note={`after ${report.commissionPct}% commission`} />
            <Stat label="Sold through" value={`${report.sellThroughPct}%`} note={`${report.remaining} still available`} />
          </dl>
          {report.recent.length > 0 && (
            <a
              href={`/api/vendor/sales?token=${encodeURIComponent(token)}`}
              className="mt-6 inline-block text-xs uppercase tracking-[0.2em] underline underline-offset-4 hover:text-neutral-500"
            >
              Download every sale as a spreadsheet (CSV) →
            </a>
          )}
        </Section>

        <Section>
          <p className="text-[15px] font-medium">By product</p>
          <div className="mt-1.5">
            <Muted>Best sellers first. Each size says how many are still on the rail and how many have sold.</Muted>
          </div>
          {report.byProduct.length === 0 ? (
            <div className="mt-6"><Muted>No stock on the rail yet.</Muted></div>
          ) : (
            <ul className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200">
              {report.byProduct.map((p) => (
                <li key={p.productId} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 py-4 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto]">
                  <div className="relative row-span-2 h-[4.5rem] w-14 overflow-hidden rounded-md bg-gray-200 sm:row-span-1">
                    {p.imageUrl ? (
                      <Image src={sized(p.imageUrl, 200)} alt="" fill sizes="56px" className="object-cover object-top" />
                    ) : (
                      <PhotoPlaceholder />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-neutral-900">
                      {p.title}
                      {p.colour && <span className="text-neutral-500"> · {p.colour}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {p.unitsSold === 0
                        ? `${p.remaining} on the rail, none sold yet`
                        : `${p.unitsSold} sold for ${money(p.revenueGbp)} · ${p.remaining} left`}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {p.sizes.map((s) => {
                        const soldOut = s.remaining === 0;
                        return (
                          <span
                            key={s.size ?? "one"}
                            className={`inline-flex items-baseline gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                              soldOut ? "border-neutral-200 text-neutral-400" : "border-neutral-300 text-neutral-900"
                            }`}
                          >
                            <span className={soldOut ? "line-through" : "font-medium"}>{s.size ?? "One size"}</span>
                            <span className="text-[11px] text-neutral-500">
                              {soldOut ? "sold out" : `${s.remaining} left`}
                              {s.sold > 0 && !soldOut && ` · ${s.sold} sold`}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="col-start-2 mt-3 flex gap-6 text-sm sm:col-start-3 sm:mt-0 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
                    <span className="tabular-nums">
                      <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">Sold </span>
                      {p.unitsSold}
                    </span>
                    <span className="tabular-nums">
                      <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">Left </span>
                      {p.remaining}
                    </span>
                    <span className="tabular-nums text-neutral-900">{money(p.revenueGbp)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {report.byDay.length > 0 && (
          <Section>
            <p className="text-[15px] font-medium">By day</p>
            <table className="mt-6 w-full border-y border-neutral-200 text-sm">
              <tbody className="divide-y divide-neutral-100">
                {report.byDay.map((d) => (
                  <tr key={d.day}>
                    <td className="py-3 pr-4">{d.day}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-neutral-500">{d.units} {d.units === 1 ? "unit" : "units"}</td>
                    <td className="py-3 text-right tabular-nums">{money(d.revenueGbp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {report.recent.length > 0 && (
          <Section>
            <p className="text-[15px] font-medium">Every sale</p>
            <div className="mt-1.5">
              <Muted>Most recent first. "Online" is a shopper paying on their phone; "Counter" is the till.</Muted>
            </div>
            <table className="mt-6 w-full border-y border-neutral-200 text-sm">
              <tbody className="divide-y divide-neutral-100">
                {report.recent.map((s, i) => (
                  <tr key={`${s.collectCode}-${i}`}>
                    <td className="py-3 pr-4 whitespace-nowrap text-neutral-500">{TIME.format(new Date(s.at))}</td>
                    <td className="py-3 pr-4">
                      {s.productTitle}
                      <span className="text-neutral-500">{[s.colour, s.size].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
                    </td>
                    <td className="py-3 pr-4 text-right text-xs uppercase tracking-wide text-neutral-400">{s.source === "till" ? "Counter" : "Online"}</td>
                    <td className="py-3 text-right tabular-nums">{money(s.priceGbp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        <SiteFooter />
      </Container>
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">{label}</dt>
      <dd className="mt-2 font-display text-3xl">{value}</dd>
      {note && <dd className="mt-1 text-xs text-neutral-500">{note}</dd>}
    </div>
  );
}
