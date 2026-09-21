"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { generateSettlement, getActiveEvent } from "@/lib/live-event";

export async function generateSettlementAction(formData: FormData) {
  const popupBrandId = String(formData.get("popup_brand_id") ?? "");
  const finalize = formData.get("finalize") === "true";
  if (!popupBrandId) return;

  try {
    const event = await getActiveEvent();
    await generateSettlement({
      eventId: event.id,
      popupBrandId,
      finalize,
      generatedBy: "organiser",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate settlement.";
    redirect(`/admin/dashboard?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/admin/dashboard");
  redirect("/admin/dashboard?updated=1");
}
