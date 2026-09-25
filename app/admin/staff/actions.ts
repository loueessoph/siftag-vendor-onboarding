"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUnitStatus, setUnitStatus } from "@/lib/live-event";
import { readSession } from "@/lib/admin-session";

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
  // Named staff account if there is one, so the unit history says who tapped.
  const session = await readSession();
  const changedBy = session?.role === "staff" ? session.name : String(formData.get("changed_by") ?? "staff");

  if (!unitId || !eventId || !isUnitStatus(toStatus)) {
    redirect(`/admin/staff?code=${encodeURIComponent(unitCode)}&error=1`);
  }

  await setUnitStatus({ unitId, eventId, toStatus, changedBy });
  revalidatePath("/admin/staff");
  revalidatePath("/admin/dashboard");
  redirect(`/admin/staff?code=${encodeURIComponent(unitCode)}&updated=1`);
}
