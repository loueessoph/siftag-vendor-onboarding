import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/chrome";
import { readSession } from "@/lib/admin-session";
import { terminalEnabled } from "@/lib/till";
import { TillClient } from "./till-client";

export const metadata: Metadata = {
  title: "Checkout: Siftag pop-up admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The till. Scan tags into a basket, take payment on the card reader (or
 * by QR when there isn't one), or record cash. Built for a phone or tablet
 * held at the counter, so everything is one column and the scan box keeps
 * focus for a keyboard-wedge scanner.
 */
export default async function TillPage() {
  const session = await readSession();
  return (
    <AdminShell eyebrow="Event day" title="Checkout" back={null}>
      <TillClient terminal={terminalEnabled()} staffName={session?.name ?? "Staff"} />
    </AdminShell>
  );
}
