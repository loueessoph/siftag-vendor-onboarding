/**
 * Prints every table PostgREST exposes in the Supabase project, so we can see
 * what the marketplace already owns before writing a single migration.
 *
 *   npm run db:tables
 *
 * Reads .env.local via node --env-file. Uses the service role key if present,
 * otherwise the anon key — the anon key still returns the OpenAPI spec, it just
 * omits anything RLS hides entirely.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and a key in .env.local first (see .env.local.example)."
  );
  process.exit(1);
}

const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});

if (!res.ok) {
  console.error(`Supabase returned ${res.status} ${res.statusText}`);
  process.exit(1);
}

const spec = await res.json();
const tables = Object.keys(spec.definitions ?? spec.components?.schemas ?? {});

const popup = tables.filter((t) => t.startsWith("popup_")).sort();
const existing = tables.filter((t) => !t.startsWith("popup_")).sort();

console.log(`\nExisting marketplace tables (${existing.length}) — do not touch:`);
for (const t of existing) console.log(`  ${t}`);

console.log(`\npopup_ tables (${popup.length}) — ours:`);
if (popup.length === 0) console.log("  (none yet)");
for (const t of popup) console.log(`  ${t}`);
console.log();
