import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/chrome";
import { listAdminItems } from "@/lib/admin-items";
import { ItemsClient } from "./items-client";

export const metadata: Metadata = {
  title: "Items: Siftag pop-up admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Every item on the rails, with its stock and tag codes, searchable by name, brand or code. */
export default async function AdminItemsPage() {
  const items = await listAdminItems();
  const total = items.reduce((s, i) => s + i.counts.available + i.counts.held + i.counts.fitting_room + i.counts.sold, 0);
  return (
    <AdminShell eyebrow="Stock" title={`${items.length} items · ${total} garments`}>
      <ItemsClient items={items} />
    </AdminShell>
  );
}
