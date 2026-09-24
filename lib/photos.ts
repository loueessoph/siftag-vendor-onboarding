/**
 * Photos a brand uploads for items that have none: hand-added items, or a
 * scraped product whose site had no image. Stored in a public Supabase
 * Storage bucket and referenced by URL from `popup_products.image_url`, the
 * same column the scrape fills, so nothing downstream knows the difference.
 */

import sharp from "sharp";
import { supabaseAdmin } from "./supabase/server";

export const PHOTO_BUCKET = "popup-photos";
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/heic", "heic"],
  ["image/heif", "heic"],
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
  const { bytes, contentType, ext } = await webReady(Buffer.from(await file.arrayBuffer()), file.type);
  const path = `${brandId}/${productId}-${Date.now()}.${ext}`;
  const { error: uploadError } = await db.storage
    .from(PHOTO_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (uploadError) throw uploadError;

  const url = db.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  const { error: updateError } = await db
    .from("popup_products")
    .update({ image_url: url, image_urls: [url] })
    .eq("id", productId);
  if (updateError) throw updateError;
  return url;
}

/**
 * Whatever a phone hands over, stored as something every browser shows:
 * HEIC (the iPhone default) is decoded and re-encoded as JPEG, and any
 * photo is rotated the right way up and capped at 2000px on the long side,
 * which is plenty for the storefront and a fraction of the upload size.
 * GIFs pass through untouched so an animation survives.
 */
export async function webReady(
  input: Buffer,
  mime: string
): Promise<{ bytes: Buffer; contentType: string; ext: string }> {
  if (mime === "image/gif") return { bytes: input, contentType: mime, ext: "gif" };
  let source: Buffer = input;
  if (mime === "image/heic" || mime === "image/heif") {
    const { default: convert } = await import("heic-convert");
    source = Buffer.from(await convert({ buffer: new Uint8Array(input), format: "JPEG", quality: 0.92 }));
  }
  const keepPng = mime === "image/png";
  const image = sharp(source).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true });
  const bytes = keepPng ? await image.png().toBuffer() : await image.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  return keepPng ? { bytes, contentType: "image/png", ext: "png" } : { bytes, contentType: "image/jpeg", ext: "jpg" };
}
