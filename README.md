# siftag-vendor-onboarding

Vendor onboarding for the Siftag pop-up at Fabrica X, King's Cross, 25 to 27
September 2026.

One job: get an approved product list from every brand by **4 September**, turn
it into a till import before the event, and turn the till's sales export into
per-brand payout reports within 14 days after.

Live at **https://siftag-vendor-onboarding.vercel.app** (noindexed).

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
| `RESEND_API_KEY` | Not set yet. Without it, emails log instead of sending |
| `NEXT_PUBLIC_SITE_URL` | Used to build the vendor links you paste into emails |

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
   per size, adjust the pop-up price, type fibre composition. Autosaves.
   Submitting freezes it.
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

**Till codes are always ours**, `SFTG-{BRAND}-001`, never the brand's own SKU.
Two brands can each ship a `TP-01`, and a collision would corrupt the payout
join rather than fail visibly. There's a unique index on it.

**Submissions are snapshotted.** `popup_submissions` and
`popup_submission_items` hold a frozen copy taken at submit. Tags, the till and
the payout all read from there, so a brand editing their website in late
September can't change what they're owed.

**The 90% natural fibre rule** is clause 4.2 and a condition of approval.
`lib/fibre.ts` reads a percentage out of whatever the vendor types, treats
regenerated cellulosics (viscose, modal, lyocell, bamboo) as *not* natural, and
returns null rather than guessing at a fibre it doesn't recognise. The selector
blocks inline; submit re-checks server-side on the same rules.

## Migrations

SQL files in `supabase/migrations/`, run by hand in the Supabase SQL editor,
in order. There's no migration runner wired up.

```bash
npm run db:tables   # lists every table in the project, ours and the marketplace's
```

## Not built yet

- **Email doesn't send.** `lib/email.ts` is written and both messages exist,
  but with no `RESEND_API_KEY` it logs what it would have sent and reports
  `delivered: false`, so an unsent notice never looks like a sent one.
- **Reminder schedule** (21 Aug, 28 Aug, 1 Sept, 3 Sept) isn't wired up.
- **Approvals queue**, **delivery check-in**, **payout reports**.
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
