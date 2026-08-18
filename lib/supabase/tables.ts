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
] as const;

export type PopupTable = (typeof POPUP_TABLES)[number];

export function assertPopupTable(name: string): asserts name is PopupTable {
  if (!name.startsWith("popup_")) {
    throw new Error(
      `Refusing to query "${name}": this app may only touch popup_ tables.`
    );
  }
}
