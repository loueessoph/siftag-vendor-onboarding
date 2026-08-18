/**
 * Admin session: one shared password, checked once, then a signed cookie.
 *
 * Proportionate for a two-person team and an eight-week tool. The cookie is
 * an HMAC over its own expiry, so it can't be forged without the secret and
 * can't be replayed past its lifetime. Web Crypto throughout so the same code
 * runs in middleware.
 */

export const ADMIN_COOKIE = "siftag_admin";
const SESSION_HOURS = 12;

function secret(): string {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value) throw new Error("ADMIN_SESSION_SECRET is not set.");
  return value;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return Buffer.from(mac).toString("base64url");
}

export async function createSessionToken(): Promise<string> {
  const expiry = String(Date.now() + SESSION_HOURS * 3_600_000);
  return `${expiry}.${await sign(expiry)}`;
}

export async function verifySessionToken(
  token: string | undefined
): Promise<boolean> {
  if (!token) return false;
  const [expiry, mac] = token.split(".");
  if (!expiry || !mac) return false;
  if (!Number.isFinite(Number(expiry)) || Number(expiry) < Date.now()) {
    return false;
  }
  // Constant-time comparison: both sides are fixed-length base64url MACs.
  const expected = await sign(expiry);
  if (expected.length !== mac.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ mac.charCodeAt(i);
  }
  return diff === 0;
}

/** Compares a submitted password to ADMIN_PASSWORD without leaking length. */
export function passwordMatches(submitted: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = new TextEncoder().encode(submitted);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
