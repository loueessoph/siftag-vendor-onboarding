import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertPopupTable, type PopupTable } from "./tables";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Server-side client. Vendor routes are unauthenticated and identified only by
 * the token in the URL, so the lookup that turns a token into a brand has to
 * happen on the server with the service role key — never in the browser.
 */
export function supabaseAdmin(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** `supabaseAdmin().from()`, with the popup_ prefix rule enforced. */
export function fromPopup(table: PopupTable) {
  assertPopupTable(table);
  return supabaseAdmin().from(table);
}
