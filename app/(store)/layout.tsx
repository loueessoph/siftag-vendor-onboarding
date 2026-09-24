import type { ReactNode } from "react";
import { CartProvider } from "@/components/store/cart";
import { StoreHeader } from "@/components/store/header";

/** Every shopper-facing page: the header with the bag, and the bag itself, kept in the browser. */
export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <CartProvider>
      <div className="min-h-screen bg-white text-gray-900">
        <StoreHeader />
        {children}
        <footer className="mx-auto max-w-7xl px-6 py-10 text-center text-[11px] tracking-widest text-gray-400">
          SIFTAG POP-UP · FABRICA X, 36–40 YORK WAY, KING&apos;S CROSS · 25–27 SEPTEMBER 2026
        </footer>
      </div>
    </CartProvider>
  );
}
