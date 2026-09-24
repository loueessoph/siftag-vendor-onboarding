import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/chrome";
import { PickupClient } from "./pickup-client";

export const metadata: Metadata = {
  title: "Order pickup: Siftag pop-up admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** The Express counter: online orders waiting to be packed and handed over. */
export default function PickupPage() {
  return (
    <AdminShell eyebrow="Express counter" title="Order pickup" back={null}>
      <PickupClient />
    </AdminShell>
  );
}
