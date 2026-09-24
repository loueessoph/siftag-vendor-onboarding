/**
 * Re-encodes any vendor-uploaded HEIC photo as JPEG so browsers can show it,
 * uploads the JPEG next to the original and points the product at it. The
 * upload route now does this on the way in; this catches what got in before.
 * Dry run unless --write is passed.
 *   node --experimental-strip-types --import ./scripts/ts-resolver.mjs --env-file=.env.local scripts/convert-heic-photos.ts --write
 */
import { supabaseAdmin } from "../lib/supabase/server";
import { PHOTO_BUCKET, webReady } from "../lib/photos";

const write = process.argv.includes("--write");
const db = supabaseAdmin();
const { data: products, error } = await db
  .from("popup_products")
  .select("id, title, image_url, image_urls, popup_brand_id")
  .or("image_url.ilike.%.heic,image_url.ilike.%.heif");
if (error) throw error;
console.log(`${products?.length ?? 0} product(s) with a HEIC photo${write ? "" : " (dry run)"}`);

for (const p of products ?? []) {
  const res = await fetch(p.image_url as string);
  if (!res.ok) { console.log(`  ${p.title}: could not fetch (${res.status})`); continue; }
  const { bytes, contentType, ext } = await webReady(Buffer.from(await res.arrayBuffer()), "image/heic");
  const path = `${p.popup_brand_id}/${p.id}-${Date.now()}.${ext}`;
  console.log(`  ${p.title}: ${(bytes.length / 1024).toFixed(0)}KB JPEG -> ${path}`);
  if (!write) continue;
  const { error: up } = await db.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (up) throw up;
  const url = db.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  const { error: upd } = await db.from("popup_products").update({ image_url: url, image_urls: [url] }).eq("id", p.id);
  if (upd) throw upd;
  console.log(`    updated -> ${url}`);
}
