import { NextResponse, type NextRequest } from "next/server";
import { getVendorByToken } from "@/lib/vendor";
import { listEditable } from "@/lib/dates";
import { attachPhoto, photoProblem } from "@/lib/photos";

/** Multipart: token, productId, photo. Sets the product's image. */
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const token = String(form.get("token") ?? "");
  const productId = String(form.get("productId") ?? "");
  const photo = form.get("photo");
  if (!token || !productId || !(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: "Choose a photo first." }, { status: 400 });
  }

  const context = await getVendorByToken(token);
  if (!context) return NextResponse.json({ error: "Unknown link" }, { status: 404 });
  if (!listEditable(context.brand)) {
    return NextResponse.json(
      { error: "The product list deadline has passed, so your list is now fixed." },
      { status: 409 }
    );
  }
  const problem = photoProblem(photo);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    const url = await attachPhoto(context.brand.id, productId, photo);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    console.error("photo upload failed", e);
    return NextResponse.json({ error: "Could not upload that photo." }, { status: 500 });
  }
}
