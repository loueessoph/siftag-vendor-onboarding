-- Siftag pop-up vendor onboarding — initial schema.
--
-- This project shares a Supabase project with the Siftag marketplace, which
-- owns audit_log, brand_highlights, brand_partners, favorites, homepage_edits,
-- links_raw, price_snapshots, product_views, profiles, search_history,
-- siftag_products, style_edits, user_events and user_sessions.
--
-- Nothing below touches any of them. Every object created here is prefixed
-- popup_, and this file contains no ALTER or DROP against an existing object.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function popup_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------

create table if not exists popup_brands (
  id uuid primary key default gen_random_uuid(),

  -- Identity
  name text not null,                      -- display name, "India Grace London"
  legal_name text,                         -- as it appears on the agreement
  slug text not null unique,               -- "indiagracelondon", for readable links
  -- Short code for tags where a brand has no barcodes: SFTG-{brand_code}-{n}
  brand_code text not null unique,
  contact_name text,
  contact_email text not null,
  shopify_domain text,                     -- null for CSV-upload brands
  is_international boolean not null default false,

  -- Commercials. Per brand, never global: standard vendors are £350 at 10%,
  -- Nero is £1,000 at 20%, part-weekend rates differ again, and some brands
  -- pay a deposit with the balance taken out of sales.
  fee_gbp numeric(10,2) not null,
  deposit_gbp numeric(10,2),               -- null = whole fee paid up front
  balance_terms text,                      -- e.g. "deducted from sales proceeds"
  commission_pct numeric(5,2) not null default 10,
  -- Free text substituted into clause 2.1 where a brand's payment structure
  -- doesn't fit the standard wording. Null uses the standard clause.
  payment_terms_note text,
  vat_status text,

  -- Access. Long random token, no login: proportionate for 14 brands, but it
  -- means the token is the only thing standing between a stranger and this
  -- brand's terms, so it is never derived from the slug.
  access_token text not null unique,

  -- Agreement. The version and the exact wording shown are what make a typed
  -- signature defensible later, so they are stored with it rather than
  -- inferred from whatever content/agreement.ts happens to say today.
  agreement_status text not null default 'unsigned'
    check (agreement_status in ('unsigned', 'signed')),
  agreement_version text,
  agreement_signed_at timestamptz,
  agreement_signed_name text,
  agreement_signed_title text,
  agreement_signed_email text,
  agreement_signed_ip text,
  agreement_signed_user_agent text,

  -- Payment, taken on the separate reservation site.
  fee_paid_at timestamptz,
  stripe_session_id text,

  -- Product list progress. last_opened_at is what tells a brand who has never
  -- clicked the link apart from one who started and stalled, which is the
  -- difference between two reminder emails and who gets phoned on the 3rd.
  submission_status text not null default 'not_opened'
    check (submission_status in ('not_opened', 'opened', 'in_progress', 'submitted')),
  submitted_at timestamptz,
  last_opened_at timestamptz,
  last_saved_at timestamptz,
  reminders_sent jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger popup_brands_updated_at
  before update on popup_brands
  for each row execute function popup_set_updated_at();

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

create table if not exists popup_products (
  id uuid primary key default gen_random_uuid(),
  popup_brand_id uuid not null references popup_brands(id) on delete cascade,

  -- From the scrape. Re-scraping overwrites these and nothing else.
  shopify_product_id text,
  title text not null,
  handle text,
  image_url text,

  -- Entered by the vendor. A re-scrape must never clear these.
  fibre_composition text,
  natural_fibre_pct numeric(5,2),
  care_notes text,
  sizing_notes text,

  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  approval_note text,

  scraped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (popup_brand_id, shopify_product_id)
);

create index if not exists popup_products_brand_idx
  on popup_products (popup_brand_id);

create trigger popup_products_updated_at
  before update on popup_products
  for each row execute function popup_set_updated_at();

create table if not exists popup_variants (
  id uuid primary key default gen_random_uuid(),
  popup_product_id uuid not null references popup_products(id) on delete cascade,

  -- From the scrape.
  shopify_variant_id text,
  sku text,
  barcode text,
  size text,
  colour text,
  online_price numeric(10,2),

  -- Set by the vendor. `selected` is deliberately separate from
  -- quantity_declared: a brand who ticks a dress before they have counted
  -- stock has chosen it, and collapsing that into quantity = 0 would make a
  -- half-finished list look abandoned.
  selected boolean not null default false,
  popup_price numeric(10,2),
  quantity_declared integer check (quantity_declared >= 0),

  -- Filled at check-in. Kept alongside the declared figure rather than
  -- replacing it; the gap between the two is where payout disputes start.
  quantity_received integer check (quantity_received >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (popup_product_id, shopify_variant_id)
);

create index if not exists popup_variants_product_idx
  on popup_variants (popup_product_id);

create trigger popup_variants_updated_at
  before update on popup_variants
  for each row execute function popup_set_updated_at();

-- ---------------------------------------------------------------------------
-- Submission snapshot
-- ---------------------------------------------------------------------------

-- Frozen at the moment a brand presses submit. The live catalogue keeps
-- changing after that — they discount something, delete a product, restock —
-- so tags, the till and the payout all read from here instead, and a brand
-- editing their website in late September cannot alter what we owe them.

create table if not exists popup_submissions (
  id uuid primary key default gen_random_uuid(),
  popup_brand_id uuid not null references popup_brands(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  item_count integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists popup_submissions_brand_idx
  on popup_submissions (popup_brand_id);

create table if not exists popup_submission_items (
  id uuid primary key default gen_random_uuid(),
  popup_submission_id uuid not null
    references popup_submissions(id) on delete cascade,
  popup_variant_id uuid references popup_variants(id) on delete set null,

  -- Copied, not joined. The point of a snapshot is that it survives the
  -- source row changing or being deleted.
  sku text not null,
  barcode text,
  product_title text not null,
  size text,
  colour text,
  fibre_composition text,
  natural_fibre_pct numeric(5,2),
  online_price numeric(10,2),
  popup_price numeric(10,2) not null,
  quantity_declared integer not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists popup_submission_items_submission_idx
  on popup_submission_items (popup_submission_id);

create index if not exists popup_submission_items_sku_idx
  on popup_submission_items (sku);

-- ---------------------------------------------------------------------------
-- Deliveries
-- ---------------------------------------------------------------------------

create table if not exists popup_deliveries (
  id uuid primary key default gen_random_uuid(),
  popup_brand_id uuid not null references popup_brands(id) on delete cascade,
  received_at timestamptz not null default now(),
  box_count integer,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists popup_deliveries_brand_idx
  on popup_deliveries (popup_brand_id);

-- ---------------------------------------------------------------------------
-- Post-event sales
-- ---------------------------------------------------------------------------

-- The till's export, kept rather than processed and thrown away, so a payout
-- figure queried in October can be re-run from the same file and match.

create table if not exists popup_sales_imports (
  id uuid primary key default gen_random_uuid(),
  filename text,
  imported_at timestamptz not null default now(),
  row_count integer not null default 0,
  unmatched_count integer not null default 0
);

create table if not exists popup_sales (
  id uuid primary key default gen_random_uuid(),
  popup_sales_import_id uuid not null
    references popup_sales_imports(id) on delete cascade,
  -- Null where a SKU in the till export matched no submitted item. Those are
  -- surfaced for manual resolution rather than silently dropped.
  popup_brand_id uuid references popup_brands(id) on delete set null,
  sku text not null,
  quantity integer not null default 0,
  gross_gbp numeric(10,2) not null default 0,
  card_fee_gbp numeric(10,2) not null default 0,
  is_refund boolean not null default false,
  sold_at timestamptz,
  source_row jsonb,
  created_at timestamptz not null default now()
);

create index if not exists popup_sales_import_idx
  on popup_sales (popup_sales_import_id);

create index if not exists popup_sales_brand_idx
  on popup_sales (popup_brand_id);

create index if not exists popup_sales_sku_idx
  on popup_sales (sku);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- RLS on, with no policies at all. The anon key therefore reads nothing from
-- these tables, which is what we want: vendor pages are unauthenticated and
-- identified only by a token, so the token lookup and every read and write
-- behind it happen server-side under the service role, which bypasses RLS.
-- Nothing here is ever queried from the browser.

alter table popup_brands           enable row level security;
alter table popup_products         enable row level security;
alter table popup_variants         enable row level security;
alter table popup_submissions      enable row level security;
alter table popup_submission_items enable row level security;
alter table popup_deliveries       enable row level security;
alter table popup_sales_imports    enable row level security;
alter table popup_sales            enable row level security;
