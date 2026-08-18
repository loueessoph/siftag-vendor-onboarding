"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AGREEMENT_BLOCKERS, AGREEMENT_VERSION } from "@/content/agreement";
import {
  declareDispatch,
  getVendorByToken,
  recordSignature,
  saveWeekendPlans,
  savePostUrls,
} from "@/lib/vendor";
import { vendorPath } from "@/lib/brands";
import { notifyAgreementSigned } from "@/lib/email";

export async function signAgreementAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const vatNumber = String(formData.get("vat_number") ?? "").trim();

  // The same guard the button carries, repeated here: a disabled control is a
  // courtesy, not a control.
  if (AGREEMENT_BLOCKERS.length > 0) {
    throw new Error("Signing is disabled while the agreement has open issues.");
  }

  const context = await getVendorByToken(token);
  if (!context) redirect("/");

  const base = vendorPath(context.brand.slug, token);
  if (!name || !title || !email.includes("@")) {
    redirect(`${base}/agreement?error=incomplete`);
  }

  const headerList = await headers();
  try {
    await recordSignature(context.brand.id, {
      name,
      title,
      email,
      // The vendor is the one who knows their VAT position, and clause 2.6
      // makes it their representation, so it's captured here rather than
      // guessed by us at onboarding.
      vatNumber: vatNumber || null,
      agreementVersion: AGREEMENT_VERSION,
      // Behind Vercel the client address arrives in x-forwarded-for.
      ip: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: headerList.get("user-agent"),
    });
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`${base}/agreement?error=already-signed`);
  }

  const delivery = await notifyAgreementSigned(context.brand, {
    name,
    title,
    email,
    version: AGREEMENT_VERSION,
  });

  revalidatePath(base);
  // The signature is recorded either way — but if the email didn't go, the
  // vendor is told so rather than being promised a copy that never arrives.
  redirect(
    `${base}/agreement?signed=1${delivery.vendor.delivered ? "" : "&nomail=1"}`
  );
}

/** Step 3: the brand tells us a shipment is on its way. */
export async function declareDispatchAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const boxCount = Number(formData.get("box_count") ?? 0);
  const tracking = String(formData.get("tracking_reference") ?? "").trim();

  const context = await getVendorByToken(token);
  if (!context) redirect("/");
  const base = vendorPath(context.brand.slug, token);

  if (!Number.isFinite(boxCount) || boxCount < 1) {
    redirect(`${base}/stock?error=boxes`);
  }

  await declareDispatch(context.brand.id, {
    boxCount,
    trackingReference: tracking || null,
  });

  revalidatePath(base);
  redirect(`${base}/stock?saved=1`);
}

/** Step 4: a link to a post the brand has published, so we can repost it. */
export async function addPostUrlAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const url = String(formData.get("post_url") ?? "").trim();

  const context = await getVendorByToken(token);
  if (!context) redirect("/");
  const base = vendorPath(context.brand.slug, token);

  // A bare handle or a half-typed address would silently become a dead link
  // in our repost queue, so it has to parse as a real one.
  let normalised: string;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (!parsed.hostname.includes(".")) throw new Error("no host");
    normalised = parsed.toString();
  } catch {
    redirect(`${base}/marketing?error=url`);
  }

  const existing = (context.brand.post_urls ?? []) as string[];
  await savePostUrls(context.brand.id, [...existing, normalised]);

  revalidatePath(base);
  redirect(`${base}/marketing?saved=1`);
}

export async function removePostUrlAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const url = String(formData.get("post_url") ?? "");

  const context = await getVendorByToken(token);
  if (!context) redirect("/");
  const base = vendorPath(context.brand.slug, token);

  const existing = (context.brand.post_urls ?? []) as string[];
  await savePostUrls(
    context.brand.id,
    existing.filter((u) => u !== url)
  );

  revalidatePath(base);
  redirect(`${base}/marketing`);
}

/** Step 4: which days they're working, and anything they need from us. */
export async function saveWeekendPlansAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const days = formData.getAll("days").map(String);
  const requests = String(formData.get("special_requests") ?? "").trim();

  const context = await getVendorByToken(token);
  if (!context) redirect("/");
  const base = vendorPath(context.brand.slug, token);

  await saveWeekendPlans(context.brand.id, {
    days,
    specialRequests: requests || null,
  });

  revalidatePath(base);
  redirect(`${base}/marketing?saved=plans`);
}
