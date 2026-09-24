import { supabaseAdmin } from "./server";

/**
 * PostgREST caps an unbounded select at a server-configured max (commonly
 * 1000 rows) — with 3000+ popup_variants onboarded, a plain `.select()`
 * silently returns only the first 1000. Pages in parallel: gets an exact
 * count first, then fires every page at once, so wall-clock is one
 * round-trip's worth of latency, not one per page.
 */
export async function fetchAllRows<T>(
  table: string,
  select: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modify?: (query: any) => any
): Promise<T[]> {
  const PAGE = 1000;
  const db = supabaseAdmin();

  let countQuery = db.from(table).select("*", { count: "exact", head: true });
  if (modify) countQuery = modify(countQuery);
  const { count, error: countError } = await countQuery;
  if (countError) throw countError;
  const total = count ?? 0;
  if (total === 0) return [];

  const pageStarts: number[] = [];
  for (let from = 0; from < total; from += PAGE) pageStarts.push(from);

  const pages = await Promise.all(
    pageStarts.map(async (from) => {
      let query = db.from(table).select(select);
      if (modify) query = modify(query);
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) throw error;
      return (data ?? []) as T[];
    })
  );
  return pages.flat();
}
