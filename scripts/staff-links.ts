/**
 * Prints the floor team's sign-in link for the site in NEXT_PUBLIC_SITE_URL.
 * One link for everyone: it asks who you are, then keeps you signed in for
 * 30 days. Only valid where the same ADMIN_SESSION_SECRET is set.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolver.mjs --env-file=.env.local scripts/staff-links.ts
 */
import { staffLinkToken } from "../lib/admin-auth";

const origin = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002").replace(/\/$/, "");
console.log(`${origin}/staff/${await staffLinkToken()}`);
