import { NextRequest, NextResponse } from "next/server";
import { fromPopup } from "@/lib/supabase/server";
import { tillSession } from "../../till/_auth";

/** How many online orders are paid and not yet collected: the red number on the Order pickup tab. */
export async function GET(request: NextRequest) {
  const session = await tillSession(request);
  if (session instanceof NextResponse) return session;
  const { count, error } = await fromPopup("popup_orders")
    .select("id", { count: "exact", head: true })
    .eq("source", "express")
    .eq("status", "paid");
  if (error) {
    console.error("Pickup count failed", error);
    return NextResponse.json({ error: "Could not count orders" }, { status: 500 });
  }
  return NextResponse.json({ waiting: count ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}
