-- Additions after scraping a real catalogue (indiagracelondon.com).
--
-- Three things that catalogue showed:
--
--  1. No barcodes at all, but 109 of 114 variants carry the brand's own SKU
--     (TP-COR-WHT-XS). A vendor's scheme is only unique within that vendor, so
--     the till code must still be ours; theirs is worth keeping for packing
--     and for answering "which one is that" over the phone.
--  2. Shopify's product_type is populated on everything real (Dresses, Tops,
--     Skirts) and gives the selector a category filter for free.
--  3. The catalogue contains a gift card, which cannot be sold at a physical
--     pop-up. Excluding rather than deleting keeps the decision visible and
--     reversible.
--
-- Only popup_ objects are touched.

alter table popup_variants
  add column if not exists vendor_sku text;

alter table popup_products
  add column if not exists product_type text;

alter table popup_products
  add column if not exists is_excluded boolean not null default false;

alter table popup_products
  add column if not exists exclusion_reason text;

-- The till cannot cope with two brands shipping the same code, and a silent
-- collision would corrupt the payout join rather than fail loudly. Partial so
-- that variants still awaiting a generated code don't trip over each other.
create unique index if not exists popup_variants_sku_key
  on popup_variants (sku)
  where sku is not null;

create index if not exists popup_variants_vendor_sku_idx
  on popup_variants (vendor_sku);
