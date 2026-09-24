/**
 * This app shares a Supabase project with the Siftag marketplace, whose own
 * `brands` and `products` tables sit in the same schema. Every table this app
 * touches is prefixed `popup_`, and that rule is enforced at the call site
 * rather than left to review: `from()` below refuses any other name.
 */

export const POPUP_TABLES = [
  "popup_brands",
  "popup_products",
  "popup_variants",
  "popup_deliveries",
  "popup_submissions",
  "popup_submission_items",
  "popup_sales_imports",
  "popup_sales",
  // Live-event layer (built on the Siftag-Popup branch of the main
  // siftag repo): one row per physical garment/QR tag, holds, the
  // virtual queue, express-checkout orders, and settlement snapshots.
  "popup_events",
  "popup_units",
  "popup_holds",
  "popup_customers",
  "popup_queue_tickets",
  "popup_orders",
  "popup_order_items",
  "popup_notify_requests",
  "popup_unit_events",
  "popup_settlements",
  // Views, not tables, but named the same way and read the same way.
  "popup_stock_by_brand",
  "popup_sales_by_brand",
] as const;

export type PopupTable = (typeof POPUP_TABLES)[number];

export function assertPopupTable(name: string): asserts name is PopupTable {
  if (!name.startsWith("popup_")) {
    throw new Error(
      `Refusing to query "${name}": this app may only touch popup_ tables.`
    );
  }
}
