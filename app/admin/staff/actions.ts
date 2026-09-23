"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUnitStatus, setUnitStatus } from "@/lib/live-event";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * The whole "two-tap" flow: staff already looked the item up (tap one —
 * see app/admin/staff/page.tsx), this is tap two. A plain form submit
 * rather than client-side fetch, same as the rest of this app's admin
 * actions — no JS needed for it to work on a shared iPad.
 */
export async function setUnitStatusAction(formData: FormData) {
  const unitId = String(formData.get("unit_id") ?? "");
  const eventId = String(formData.get("event_id") ?? "");
  const unitCode = String(formData.get("unit_code") ?? "");
  const toStatus = String(formData.get("to_status") ?? "");
  const changedBy = String(formData.get("changed_by") ?? "staff");

  if (!unitId || !eventId || !isUnitStatus(toStatus)) {
    redirect(`/admin/staff?code=${encodeURIComponent(unitCode)}&error=1`);
  }

  await setUnitStatus({ unitId, eventId, toStatus, changedBy });
  revalidatePath("/admin/staff");
  revalidatePath("/admin/dashboard");
  redirect(`/admin/staff?code=${encodeURIComponent(unitCode)}&updated=1`);
}

/**
 * Express counter: a customer who paid online shows up, staff type/scan
 * their collect code, done. Only valid from 'paid' — nothing to hand over
 * if they haven't paid yet.
 */
export async function collectOrderAction(formData: FormData) {
  const collectCode = String(formData.get("collect_code") ?? "").trim().toUpperCase();
  if (!collectCode) redirect("/admin/staff?collect_error=Enter+a+collect+code");

  const db = supabaseAdmin();
  const { data: order, error } = await db
    .from("popup_orders")
    .select("id, status")
    .eq("collect_code", collectCode)
    .maybeSingle();
  if (error) throw error;

  if (!order) redirect(`/admin/staff?collect_error=No+order+with+that+code`);
  if (order.status === "collected") redirect(`/admin/staff?collect_error=Already+collected`);
  if (order.status !== "paid") {
    redirect(`/admin/staff?collect_error=${encodeURIComponent(`Order is ${order.status.replace("_", " ")}, not ready to collect`)}`);
  }

  await db.from("popup_orders").update({ status: "collected", collected_at: new Date().toISOString() }).eq("id", order.id);
  revalidatePath("/admin/staff");
  redirect(`/admin/staff?collected=${collectCode}`);
}
