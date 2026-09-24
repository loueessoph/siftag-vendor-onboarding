/**
 * Reads the signed-in session inside server components and server actions.
 * Kept apart from admin-auth.ts because next/headers is not importable from
 * proxy.ts, which only needs the token verifier.
 */

import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifySessionToken, type Session } from "./admin-auth";

export async function readSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySessionToken(store.get(ADMIN_COOKIE)?.value);
}
