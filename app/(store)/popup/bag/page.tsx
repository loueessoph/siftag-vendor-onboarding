import type { Metadata } from "next";
import { BagClient } from "./bag-client";

export const metadata: Metadata = { title: "Your bag | Siftag Pop-Up", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface Props {
  /** `cancelled` comes back from Stripe's cancel URL with the order's collect code. */
  searchParams: Promise<{ cancelled?: string }>;
}

export default async function BagPage({ searchParams }: Props) {
  const { cancelled } = await searchParams;
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 md:px-6">
      <h1 className="mb-6 text-sm font-medium tracking-widest text-gray-900">YOUR BAG</h1>
      <BagClient cancelledCode={cancelled?.toUpperCase() ?? null} />
    </main>
  );
}
