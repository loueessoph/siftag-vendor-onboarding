/**
 * Photos a brand uploads for items that have none: hand-added items, or a
 * scraped product whose site had no image. Stored in a public Supabase
 * Storage bucket and referenced by URL from `popup_products.image_url`, the
 * same column the scrape fills, so nothing downstream knows the difference.
 */

import { supabaseAdmin } from "./supabase/server";

export const PHOTO_BUCKET = "popup-photos";
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/heic", "heic"],
]);

async function ensureBucket() {
  const storage = supabaseAdmin().storage;
  const { data } = await storage.getBucket(PHOTO_BUCKET);
  if (data) return;
  const { error } = await storage.createBucket(PHOTO_BUCKET, {
    public: true,
    fileSizeLimit: PHOTO_MAX_BYTES,
    allowedMimeTypes: [...ALLOWED.keys()],
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}

export function photoProblem(file: File): string | null {
  if (!ALLOWED.has(file.type)) return "Use a JPG, PNG, WebP, GIF or HEIC image.";
  if (file.size > PHOTO_MAX_BYTES) return "That photo is over 8 MB. A smaller export will do.";
  return null;
}

/** Uploads and points the product at it. Returns the public URL. */
export async function attachPhoto(
  brandId: string,
  productId: string,
  file: File
): Promise<string> {
  const db = supabaseAdmin();

  // Ownership first: the token identifies the brand, never the row.
  const { data: product, error: readError } = await db
    .from("popup_products")
    .select("id")
    .eq("id", productId)
    .eq("popup_brand_id", brandId)
    .maybeSingle();
  if (readError) throw readError;
  if (!product) throw new Error("Product not found for this brand.");

  await ensureBucket();
  const ext = ALLOWED.get(file.type) ?? "jpg";
  const path = `${brandId}/${productId}-${Date.now()}.${ext}`;
  const { error: uploadError } = await db.storage
    .from(PHOTO_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const url = db.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  const { error: updateError } = await db
    .from("popup_products")
    .update({ image_url: url })
    .eq("id", productId);
  if (updateError) throw updateError;
  return url;
}
