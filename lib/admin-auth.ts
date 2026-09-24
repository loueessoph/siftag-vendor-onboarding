/**
 * Admin session: a signed cookie that carries who is signed in and as what.
 *
 * Two kinds of password, one form. ADMIN_PASSWORD is the shared Siftag
 * admin password. STAFF_PASSWORDS is a comma-separated list of name:password
 * pairs, one per retail assistant; a match gives a 'staff' session under
 * that name, which proxy.ts confines to the floor console and the till. The cookie is an
 * HMAC over its own contents and expiry, so it can't be forged without the
 * secret and can't be replayed past its lifetime. Web Crypto throughout so
 * the same code runs in the proxy.
 */

export const ADMIN_COOKIE = "siftag_admin";
const SESSION_HOURS = 12;
export const SESSION_MAX_AGE_SECONDS = SESSION_HOURS * 3600;

export type SessionRole = "admin" | "staff";

export type Session = {
  role: SessionRole;
  /** Shown in the nav and written to popup_unit_events.changed_by. */
  name: string;
  /** null for the shared admin password. */
  email: string | null;
  expiresAt: number;
};

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

const encode = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const decode = (s: string) => Buffer.from(s, "base64url").toString("utf8");

export async function createSessionToken(
  who: Pick<Session, "role" | "name" | "email">
): Promise<string> {
  const expiry = String(Date.now() + SESSION_HOURS * 3_600_000);
  const payload = [expiry, who.role, encode(who.name), encode(who.email ?? "")].join(".");
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(
  token: string | undefined
): Promise<Session | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [expiry, role, name, email, mac] = parts;
  if (!Number.isFinite(Number(expiry)) || Number(expiry) < Date.now()) {
    return null;
  }
  if (role !== "admin" && role !== "staff") return null;
  // Constant-time comparison: both sides are fixed-length base64url MACs.
  const expected = await sign([expiry, role, name, email].join("."));
  if (expected.length !== mac.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ mac.charCodeAt(i);
  }
  if (diff !== 0) return null;
  return {
    role,
    name: decode(name),
    email: decode(email) || null,
    expiresAt: Number(expiry),
  };
}

/** Constant-time string equality, so a wrong guess doesn't leak how wrong. */
function sameSecret(submitted: string, expected: string): boolean {
  const a = new TextEncoder().encode(submitted);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/** Compares a submitted password to ADMIN_PASSWORD without leaking length. */
export function passwordMatches(submitted: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return sameSecret(submitted, expected);
}

/**
 * STAFF_PASSWORDS="Riha:riha_siftag,Ronette:ronette_siftag". Returns the matching
 * name, or null. Every entry is checked so timing doesn't reveal which one
 * was close.
 */
export function staffPasswordMatches(submitted: string): string | null {
  const raw = process.env.STAFF_PASSWORDS;
  if (!raw || !submitted) return null;
  let match: string | null = null;
  for (const entry of raw.split(",")) {
    const colon = entry.indexOf(":");
    if (colon < 1) continue;
    const name = entry.slice(0, colon).trim();
    const password = entry.slice(colon + 1).trim();
    if (password && sameSecret(submitted, password)) match = name;
  }
  return match;
}

/** Where a 'staff' session may go: the floor console, the till, and in/out. */
const STAFF_PATHS = [
  "/admin/staff",
  "/admin/till",
  "/api/admin/till",
  "/admin/login",
  "/api/admin/login",
  "/api/admin/logout",
];

export function staffMayVisit(pathname: string): boolean {
  return STAFF_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** The first screen after sign-in, by role. */
export function homeFor(role: SessionRole): string {
  return role === "staff" ? "/admin/staff" : "/admin";
}
