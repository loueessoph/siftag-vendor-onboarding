import type { Metadata } from "next";
import { OrderLookup } from "./order-lookup";

export const metadata: Metadata = {
  title: "Find my order | Siftag Pop-Up",
  description: "Type the pickup code from your confirmation to see your order and its QR code.",
  robots: { index: false, follow: false },
};

/** Lost the confirmation? The code alone brings the order back up. */
export default function OrderLookupPage() {
  return (
    <main className="bg-white">
      <div className="mx-auto max-w-md px-5 py-8">
        <p className="mb-6 text-xs tracking-widest text-gray-400">YOUR ORDER</p>
        <h1 className="font-display text-2xl text-neutral-900">Find my order</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          Type the six-character pickup code from your confirmation email or screenshot. You&apos;ll see what you ordered and the
          QR code to show at the Express counter.
        </p>
        <OrderLookup />
      </div>
    </main>
  );
}
