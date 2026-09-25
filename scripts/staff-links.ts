/**
 * Prints each retail assistant's private sign-in link for the site in
 * NEXT_PUBLIC_SITE_URL. Send each person their own; it signs them in as
 * themselves for 30 days with nothing to type.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolver.mjs --env-file=.env.local scripts/staff-links.ts
 */
import { staffLinkToken, staffNames } from "../lib/admin-auth";

const origin = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002").replace(/\/$/, "");
for (const name of staffNames()) {
  console.log(`${name}: ${origin}/staff/${await staffLinkToken(name)}`);
}
