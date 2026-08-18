-- Backs the three vendor forms that replaced placeholders: dispatch details,
-- social posts, and weekend plans. Plus VAT status, which the vendor now
-- confirms when they sign rather than Siftag guessing it at onboarding.
--
-- Only popup_ objects are touched.

-- --------------------------------------------------------------------------
-- Dispatch
-- --------------------------------------------------------------------------

-- popup_deliveries was written for check-in, where a row only exists once a
-- box is in our hands. A vendor telling us something is on its way is the same
-- shipment at an earlier moment, so the row is created then and received_at is
-- filled in later.
alter table popup_deliveries
  alter column received_at drop not null;

alter table popup_deliveries
  alter column received_at drop default;

alter table popup_deliveries
  add column if not exists tracking_reference text;

-- Distinguishes "the brand says this is coming" from "we have it".
alter table popup_deliveries
  add column if not exists declared_by_vendor boolean not null default false;

alter table popup_deliveries
  add column if not exists declared_at timestamptz;

-- --------------------------------------------------------------------------
-- Marketing and the weekend
-- --------------------------------------------------------------------------

-- Links to the posts a brand has published, so we can repost them. Kept as
-- jsonb rather than a table: it is a short list owned entirely by one brand,
-- never queried across brands.
alter table popup_brands
  add column if not exists post_urls jsonb not null default '[]'::jsonb;

-- Which trading days the brand is working their own space: ["2026-09-25", ...]
alter table popup_brands
  add column if not exists attending_days jsonb not null default '[]'::jsonb;

alter table popup_brands
  add column if not exists special_requests text;

-- Set by the vendor at signature time, not by us at onboarding: they are the
-- ones who know, and clause 2.6 makes it their representation.
alter table popup_brands
  add column if not exists vat_number text;
