-- Payment moves from Shopify draft orders to Stripe Checkout.
--
-- The three shopify_* columns on popup_orders only ever held draft-order
-- references from the express checkout's first version; the single order
-- that exists is cancelled with all three null, so they are dropped rather
-- than left as dead weight. (Catalogue scraping keeps its own shopify_*
-- columns on popup_products and popup_variants: those are unrelated.)
--
-- `source` says which counter opened the order, `payment_method` how it was
-- settled. Both are filled by the till in the next step; the express flow
-- writes 'express' / 'card'.

alter table popup_orders
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists source text not null default 'express'
    check (source in ('express', 'till')),
  add column if not exists payment_method text
    check (payment_method in ('card', 'cash'));

create unique index if not exists popup_orders_stripe_checkout_session_id_key
  on popup_orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists popup_orders_stripe_payment_intent_id_idx
  on popup_orders (stripe_payment_intent_id);

alter table popup_orders
  drop column if exists shopify_draft_order_id,
  drop column if exists shopify_order_id,
  drop column if exists shopify_invoice_url;
