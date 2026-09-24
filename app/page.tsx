import type { Metadata } from "next";
import PopupBrowsePage from "./popup/page";

/**
 * The public front door is the shop. The vendor information page that used
 * to live here moved to /vendors; vendors reach their own hub by the private
 * link in their email, never through this page.
 */
export const metadata: Metadata = { title: "Siftag Pop-Up", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function HomePage() {
  return <PopupBrowsePage />;
}
