import Image from "next/image";
import { ExpressCheckoutClient } from "./express-client";

export const metadata = { title: "Express Checkout | Siftag Pop-Up", robots: { index: false, follow: false } };

interface Props {
  /** `code` is a single tag scanned in; `codes` (comma-separated) and `cancelled` come back from Stripe's cancel URL. */
  searchParams: Promise<{ code?: string; codes?: string; cancelled?: string }>;
}

export default async function ExpressPage({ searchParams }: Props) {
  const { code, codes, cancelled } = await searchParams;
  const initialCodes = [...new Set([code, ...(codes ?? "").split(",")].map((c) => c?.trim().toUpperCase()).filter((c): c is string => !!c))];

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-md px-5 py-8">
        <Image src="/SiftagLogo.png" alt="Siftag" width={72} height={23} priority className="w-[72px] h-auto" />
        <h1 className="text-xl font-display text-neutral-900 mt-4 mb-1">Express checkout</h1>
        <p className="text-sm text-neutral-500 mb-6">Pay now, skip the line, collect at the Express counter.</p>
        <ExpressCheckoutClient initialCodes={initialCodes} cancelledCode={cancelled?.toUpperCase() ?? null} />
      </div>
    </main>
  );
}
