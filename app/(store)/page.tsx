import type { Metadata } from "next";
import PopupBrowsePage from "./popup/page";

/**
 * The public front door is the shop. The vendor information page that used
 * to live here moved to /vendors; vendors reach their own hub by the private
 * link in their email, never through this page.
 */
export const metadata: Metadata = {
  title: "Siftag Pop-Up at Fabrica X",
  description:
    "Shop natural-fibre pieces from independent brands at the Siftag pop-up, Fabrica X, King's Cross, 25 to 27 September 2026. Pay online, collect at the counter.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function HomePage(props: { searchParams: Promise<{ section?: string }> }) {
  return <PopupBrowsePage searchParams={props.searchParams} />;
}
