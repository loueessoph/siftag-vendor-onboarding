# siftag-vendor-onboarding

Vendor onboarding for the Siftag pop-up at Fabrica X, King's Cross, 25 to 27
September 2026.

One job: get an approved product list from every brand by **14 September**, turn
it into a till import before the event, and turn the till's sales export into
per-brand payout reports within 14 days after.

Live at **https://popup.siftag.com** (noindexed). The root is an intro page
(what Siftag is, how buying here works); the shop is `/popup` and the vendor
information page is `/vendors`. Posters for the intro live in `public/intro`,
one picked at random per visit.

## Running it

```bash
npm install
cp .env.local.example .env.local   # then fill it in, see below
npm run dev                        # localhost:3002
```

`.env.local` is gitignored and never committed. Ask Sophie for the values, or
pull them from the Vercel project:

```bash
npx vercel@55.0.0 env pull .env.local --scope loueessophs-projects
```

| Variable | What it's for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The shared Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public key. Reads nothing here by design |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side only. Every vendor read and write runs under it |
| `ADMIN_PASSWORD` | Unlocks `/admin` |
| `ADMIN_SESSION_SECRET` | Signs the admin cookie |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Email is sent as that Google account over SMTP; no DNS to set up. The app password needs 2-step verification on the account. Unset, emails log instead of sending |
| `NEXT_PUBLIC_SITE_URL` | Used to build the vendor links you paste into emails, and Stripe's return URLs |
| `STRIPE_SECRET_KEY` | Payments. Test key locally, live key on Vercel |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the webhook endpoint below |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser-side key, only used by the till's card reader |
| `STRIPE_TERMINAL_LOCATION_ID` | Optional. A Stripe Terminal location turns on card-reader payments at the till |

## How it fits together

**Payment happens elsewhere.** Brands pay on the reservation site
(`siftag-popup`, a separate project). This app starts after that: you add the
brand in `/admin`, and email them their private link.

**Vendors** land on `/vendor/{slug}/{token}` with no login. The slug makes the
link readable; the token is the credential. Four steps, all openable at any
time rather than gated in sequence, because brands come back over several
weeks and the product list is the slow one:

1. **Sign the agreement.** Rendered from `content/agreement.ts`, with the fee,
   commission and deadline filled in from that brand's record. Clause 2.1
   writes itself from the terms, so a deposit arrangement reads differently
   from a flat fee without anyone maintaining two documents.
2. **Product list.** Their own catalogue as a grid. Tick items, set quantity
   per size, adjust the pop-up price, pick fibre composition. Autosaves, and
   says so. Submitting snapshots it; they can keep editing and re-submit
   until the deadline, after which it is read-only.
3. **Get stock to us.** How many boxes, plus a tracking number.
4. **Posts and the weekend.** Links to their 3 posts, which days they're
   working, any special requests.

**Admin** is at `/admin`, behind a shared password.

## Things worth knowing before you change anything

**Every table is prefixed `popup_`.** This Supabase project also holds the
Siftag marketplace (`siftag_products`, `brand_partners`, and others). Nothing
unprefixed is created, altered, dropped or read. `lib/supabase/tables.ts`
enforces it at the call site so the rule fails loudly rather than in review.

**RLS is on with no policies.** The anon key therefore reads nothing from these
tables. Vendor pages are unauthenticated, so the token lookup and everything
behind it happen server-side under the service role. Nothing is queried from a
browser.

**Scraping reads Shopify or WooCommerce.** `lib/catalogue.ts` probes the
domain: a Shopify store answers `/products.json`, and everything else that
mentions WooCommerce is crawled by category page, with each product's size
and colour matrix read out of the `data-product_variations` JSON on its page
(`lib/woocommerce.ts`). A headless Shopify storefront (Zubek) needs its
`*.myshopify.com` domain rather than the custom one. Anything else is a CSV.

**A re-scrape must never destroy a vendor's work.** `lib/ingest.ts` splits
ownership of every column:

| Owner | Columns |
|---|---|
| The scrape | title, handle, image, product type, vendor sku, barcode, size, colour, online price |
| The vendor | fibre composition, natural fibre %, care and sizing notes, selected, pop-up price, quantity declared |
| Us | till sku (assigned once, never reissued), approval status, quantity received |

Existing rows get an update payload containing only the scrape's columns, so
the rest survives by omission. Re-scraping is blocked entirely once a brand has
submitted.

Fibre composition is the one exception: the scrape reads it out of the product
description (`extractComposition` in `lib/fibre.ts`, following the marketplace
scrapers' rules: lining and trim clauses skipped, "20% off" ignored, a single
named fibre inferred as 100% only when nothing says "blend") and seeds it into
an empty column. Once anything is there, typed or seeded, it is never touched
again. Vendors edit it as rows of fibre dropdown plus percentage
(`components/vendor/composition-editor.tsx`); the stored form stays text,
"78% Pima Cotton, 22% Silk", so submissions and tags are unchanged.

**Brands can add items by hand.** `lib/custom-items.ts` creates a product with
a `vendor:` id prefix and till codes, ticked from the start. A re-scrape never
touches ids it didn't produce, so these survive it; only these can be deleted
by the brand. Per-item notes from the brand live in `care_notes`.

**Till codes are always ours**, `SFTG-{BRAND}-001`, never the brand's own SKU.
Two brands can each ship a `TP-01`, and a collision would corrupt the payout
join rather than fail visibly. There's a unique index on it.

**Submissions are snapshotted.** `popup_submissions` and
`popup_submission_items` hold a frozen copy taken at submit. Tags, the till and
the payout all read from there, so a brand editing their website in late
September can't change what they're owed. Until the product list deadline a
brand can edit and submit again; each submit replaces the previous snapshot,
so there is exactly one per brand. A save after submitting drops
`submission_status` back to `in_progress` while `submitted_at` stays set: that
combination means "submitted, then edited, not yet re-submitted", and the hub
and admin both say so. `listEditable()` in `lib/dates.ts` is the single gate,
checked by the save and submit routes and the page. The list was extended after 14 September and now closes at 23:59 BST on 16 September (`KEY_DATES.productListExtended`); the agreement and the original emails still say 14 September.

**The 90% natural fibre rule** is clause 4.2 and a condition of approval.
`lib/fibre.ts` reads a percentage out of whatever the vendor types, treats
regenerated cellulosics (viscose, modal, lyocell, bamboo) as *not* natural, and
returns null rather than guessing at a fibre it doesn't recognise. The selector
blocks inline; submit re-checks server-side on the same rules.

## Payments

Everything is paid through Stripe Checkout: the express flow (a shopper
pays on their phone, collects at the counter) and the till. `lib/stripe.ts`
opens a hosted Checkout Session per order, one line item per garment, and
Stripe emails the receipt. Nothing is charged by this app directly. The
vendors' Shopify stores (`lib/shopify.ts`) are only ever read for their
catalogues and play no part in payment.

An order is created `pending_payment` with its units on an express hold
that outlasts the session, and only the webhook moves it on:

| Stripe event | What happens |
|---|---|
| `checkout.session.completed` (paid) | Units to `sold`, order to `paid`, order items written for settlement |
| `checkout.session.async_payment_succeeded` | Same, for payment methods that settle later |
| `checkout.session.expired`, `checkout.session.async_payment_failed` | Hold released, units back to `available`, order `cancelled` |
| `payment_intent.succeeded`, `payment_intent.canceled` | The same two outcomes for till sales on the card reader |

**Webhook setup.** In the Stripe dashboard, Developers > Webhooks, add an
endpoint for `https://<site>/api/popup/express/webhook` subscribed to the
six events above, and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
Deliveries are idempotent: a repeated event finds the order already moved on
and is skipped.

**Locally**, forward events with the Stripe CLI and use the secret it prints:

```bash
stripe listen --forward-to localhost:3002/api/popup/express/webhook
stripe trigger checkout.session.completed   # or pay with card 4242 4242 4242 4242
```

A shopper who backs out of the payment page lands on `/popup/express` with
their codes, which calls `/api/popup/express/cancel` so the items are
released immediately rather than when the session expires half an hour on.

**The till** is `/admin/till`, open to admin and staff sessions alike and
laid out for a phone or tablet. Staff scan tags into a basket (a keyboard
scanner types the tag URL; the code under the QR works too) and charge it
one of three ways, all in `lib/till.ts`:

| Mode | When | How it settles |
|---|---|---|
| Card reader | `STRIPE_TERMINAL_LOCATION_ID` is set | A `card_present` PaymentIntent is sent to the first online reader at that location; `payment_intent.succeeded` marks the order paid |
| Card by QR | no reader configured | A Checkout Session shown as a QR; the customer pays on their phone |
| Cash | not offered | The pop-up is card only. `lib/till.ts` keeps a cash path (`payment_method = 'cash'`, no Stripe call) but the till doesn't expose it and the route refuses it |

While a card payment is in flight the till polls `/api/admin/till/status`,
which also asks Stripe directly, so a sale completes even if the webhook is
late. The webhook endpoint therefore needs `payment_intent.succeeded` and
`payment_intent.canceled` on top of the Checkout events above. Till orders
carry `source = 'till'` on `popup_orders`.

## Migrations

SQL files in `supabase/migrations/`, run by hand in the Supabase SQL editor,
in order. There's no migration runner wired up.

```bash
npm run db:tables   # lists every table in the project, ours and the marketplace's
```

## Not built yet

- **Email needs the Gmail app password.** `lib/email.ts` sends as the
  Google account in `GMAIL_USER`; without it, it logs what it would have
  sent and reports `delivered: false`, so an unsent notice never looks like
  a sent one.
- **Reminder schedule** (21 Aug, 28 Aug, 1 Sept, 3 Sept) isn't wired up.
- **Delivery check-in**, **payout reports**. (The approvals queue is built:
  `/admin/approvals`, decisions stored on `popup_products`.)
- **Till export** is deliberately out of scope; handled separately.

## Design

Inherited from the `siftag-popup` reservation site, which keeps its Tailwind
config empty and expresses everything as utility classes. Those conventions are
written down as primitives in `components/ui.tsx`: Gilda Display headings,
Geist body, no border radius anywhere, no colour except `red-600` for errors,
one black button. `/design-check` renders every primitive on one page.

Two copy rules: **no em dashes** (colon or full stop instead), and the tone is
informative rather than salesy. The reservation site does the selling; by the
time a brand is here they've already paid.

## Staff logins

Retail assistants sign in at `/admin/login` with their own password and get a
`staff` session that `proxy.ts` confines to the floor console (`/admin/staff`)
and the till (`/admin/till`). Everything else under `/admin` still needs the
shared `ADMIN_PASSWORD`.

Staff passwords are `STAFF_PASSWORDS`, a comma-separated list of
`Name:password` pairs. The name is what shows in the header and what goes in
`popup_unit_events.changed_by` when they tap a status:

```
STAFF_PASSWORDS=Riha:riha_siftag,Ronette:ronette_siftag,Harriet:harriet_siftag
```

Set it locally in `.env.local` and on Vercel. To lock someone out or change a
password, edit the list and redeploy.
