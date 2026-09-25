/**
 * Garment tags: one per physical unit, printed as a cut-out grid on A4 and
 * tied to the floor by the QR, which opens /popup/tag/{unit_code} on a
 * shopper's phone and resolves the same code at the till.
 *
 * Rendered with pdf-lib (pure JS, runs on Vercel without a browser) in the
 * site's own faces, Gilda Display and Geist, with each brand's logo from
 * public/brand-logos (see scripts/fetch-brand-logos.mjs). The QR is drawn
 * as vector squares rather than an embedded bitmap so it stays crisp at
 * any print size.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, setCharacterSpacing, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import { fromPopup } from "./supabase/server";
import { fetchAllRows } from "./supabase/fetch-all";
import { getActiveEvent } from "./live-event";
import { money } from "./format";
import { normalizeSizeLabel, sizeBase, sizeQualifierRank } from "./sizes";
import { bodyFabric, splitNotes } from "./fibre";
import { siteOrigin } from "./stripe";

export type TagUnit = {
  unitCode: string;
  brandId: string;
  brandName: string;
  /** Names the logo file at public/brand-logos/<slug>.png, where one exists. */
  brandSlug: string;
  productTitle: string;
  size: string | null;
  /** Kept on the tag: two colourways of one style share a title, and staff match tag to garment by eye. */
  colour: string | null;
  /** As the vendor entered it, e.g. "100% Cotton" or "78% Pima Cotton, 22% Silk". */
  fibreComposition: string | null;
  priceGbp: number | null;
};

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL"];
function sizeRank(size: string | null): number {
  if (!size) return (SIZE_ORDER.length + 1) * 10;
  const i = SIZE_ORDER.indexOf(sizeBase(size));
  // Regular before Long within a size, so a vendor's tags come out in rail order.
  return (i === -1 ? SIZE_ORDER.length : i) * 10 + sizeQualifierRank(size);
}

/**
 * Every unit that should have a tag, for one brand or all of them: the
 * variant is ticked, the product is neither excluded nor rejected. Same
 * rules scripts/generate-units.mjs applies when creating units, so the
 * two never disagree about what is on the floor.
 */
export async function listTagUnits(brandId?: string): Promise<TagUnit[]> {
  const event = await getActiveEvent();

  const { data: brands, error: brandsError } = await fromPopup("popup_brands").select("id, name, slug");
  if (brandsError) throw brandsError;
  const brandById = new Map((brands ?? []).map((b) => [b.id as string, b as { name: string; slug: string }]));

  // The three tables are filtered against each other in memory, so all
  // three round-trips can go out at once.
  const [products, allVariants, units] = await Promise.all([
    fetchAllRows<{
      id: string;
      title: string;
      popup_brand_id: string;
      fibre_composition: string | null;
      care_notes: string | null;
    }>("popup_products", "id, title, popup_brand_id, fibre_composition, care_notes", (q) => {
      let query = q.eq("is_excluded", false).neq("approval_status", "rejected");
      if (brandId) query = query.eq("popup_brand_id", brandId);
      return query;
    }),
    fetchAllRows<{
      id: string;
      size: string | null;
      colour: string | null;
      popup_price: number | null;
      online_price: number | null;
      popup_product_id: string;
    }>("popup_variants", "id, size, colour, popup_price, online_price, popup_product_id", (q) => q.eq("selected", true)),
    fetchAllRows<{ unit_code: string; popup_variant_id: string }>("popup_units", "unit_code, popup_variant_id", (q) =>
      q.eq("event_id", event.id)
    ),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const variants = allVariants.filter((v) => productById.has(v.popup_product_id));
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const tags: TagUnit[] = [];
  for (const u of units) {
    const v = variantById.get(u.popup_variant_id);
    if (!v) continue;
    const p = productById.get(v.popup_product_id)!;
    const price = v.popup_price ?? v.online_price;
    tags.push({
      unitCode: u.unit_code,
      brandId: p.popup_brand_id,
      brandName: brandById.get(p.popup_brand_id)?.name ?? "Unknown",
      brandSlug: brandById.get(p.popup_brand_id)?.slug ?? "",
      productTitle: p.title,
      size: normalizeSizeLabel(v.size),
      colour: v.colour?.trim() || null,
      fibreComposition: p.fibre_composition?.trim() || bodyFabric(splitNotes(p.care_notes).fabric),
      priceGbp: price == null ? null : Number(price),
    });
  }

  return tags.sort(
    (a, b) =>
      a.brandName.localeCompare(b.brandName) ||
      a.productTitle.localeCompare(b.productTitle) ||
      (a.colour ?? "").localeCompare(b.colour ?? "") ||
      sizeRank(a.size) - sizeRank(b.size) ||
      a.unitCode.localeCompare(b.unitCode)
  );
}

/* Layout ------------------------------------------------------------------- */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 28; // ~10mm, inside most printers' unprintable edge
// 4 x 3 gives a 47 x 92mm portrait tag, the proportions of a standard
// 50 x 90mm swing tag, with room for a punch hole at the top.
const COLS = 4;
const ROWS = 3;
const CELL_W = (A4.width - MARGIN * 2) / COLS;
const CELL_H = (A4.height - MARGIN * 2) / ROWS;
const PAD = 10;
const LOGO_BOX = { width: 96, height: 30 };
const QR_SIZE = 72;
const HOLE_RADIUS = 4;

const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.5, 0.5, 0.5);
const RULE = rgb(0.86, 0.86, 0.86);
const CUT = rgb(0.84, 0.84, 0.84);

/** Same faces as the site: Gilda Display for headings, Geist for everything else. */
const FONT_DIR = path.join(process.cwd(), "public", "fonts");
const LOGO_DIR = path.join(process.cwd(), "public", "brand-logos");

type Fonts = { display: PDFFont; sans: PDFFont };
type Assets = {
  fonts: Fonts;
  logos: Map<string, PDFImage | null>;
};

async function loadAssets(doc: PDFDocument): Promise<Assets> {
  doc.registerFontkit(fontkit);
  const [gilda, geist] = await Promise.all([
    fs.readFile(path.join(FONT_DIR, "GildaDisplay-Regular.ttf")),
    fs.readFile(path.join(FONT_DIR, "Geist-Variable.ttf")),
  ]);
  const fonts = {
    display: await doc.embedFont(gilda, { subset: true }),
    sans: await doc.embedFont(geist, { subset: true }),
  };
  return { fonts, logos: new Map() };
}

/** A brand's logo, embedded once per document. Null when there is no file for the slug. */
async function brandLogo(doc: PDFDocument, assets: Assets, slug: string): Promise<PDFImage | null> {
  if (assets.logos.has(slug)) return assets.logos.get(slug)!;
  let image: PDFImage | null = null;
  if (slug) {
    try {
      image = await doc.embedPng(await fs.readFile(path.join(LOGO_DIR, `${slug}.png`)));
    } catch {
      image = null;
    }
  }
  assets.logos.set(slug, image);
  return image;
}

// Titles and compositions repeat across every size of a product, and the
// measuring behind them is the slow part of a sheet, so results are kept per
// font for the lifetime of the process.
const textCache = new WeakMap<PDFFont, Map<string, string>>();
const wrapCache = new WeakMap<PDFFont, Map<string, string[]>>();
function cached<T>(store: WeakMap<PDFFont, Map<string, T>>, font: PDFFont, key: string, compute: () => T): T {
  let map = store.get(font);
  if (!map) store.set(font, (map = new Map()));
  const hit = map.get(key);
  if (hit !== undefined) return hit;
  const value = compute();
  map.set(key, value);
  return value;
}

/** Drops any character the font has no glyph for, so a stray symbol can't abort the whole sheet. */
function safeText(font: PDFFont, text: string): string {
  return cached(textCache, font, text, () =>
    [...text.normalize("NFC")]
      .map((ch) => {
        try {
          font.encodeText(ch);
          return ch;
        } catch {
          return "";
        }
      })
      .join("")
  );
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number, maxLines: number): string[] {
  return cached(wrapCache, font, `${size}|${maxWidth}|${maxLines}|${text}`, () => wrapUncached(font, text, size, maxWidth, maxLines));
}

function wrapUncached(font: PDFFont, text: string, size: number, maxWidth: number, maxLines: number): string[] {
  const words = safeText(font, text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && font.widthOfTextAtSize(`${last}…`, size) > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

function drawCentered(page: PDFPage, text: string, font: PDFFont, size: number, cx: number, y: number, color = INK) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx - w / 2, y, size, font, color });
}

/**
 * Letter-spaced small caps, the way the site sets its eyebrows. Uses PDF's
 * own character-spacing operator (Tc) rather than one drawText per glyph,
 * which is what made a full sheet take seconds to build.
 */
function drawTracked(page: PDFPage, text: string, font: PDFFont, size: number, cx: number, y: number, tracking: number, color = INK) {
  const chars = [...text];
  const total = font.widthOfTextAtSize(text, size) + tracking * (chars.length - 1);
  page.pushOperators(setCharacterSpacing(tracking));
  page.drawText(text, { x: cx - total / 2, y, size, font, color });
  page.pushOperators(setCharacterSpacing(0));
}

function drawImageFitted(page: PDFPage, image: PDFImage, cx: number, top: number, box: { width: number; height: number }) {
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, { x: cx - w / 2, y: top - box.height + (box.height - h) / 2, width: w, height: h });
}

/**
 * One filled path per QR rather than one rectangle per module: a sheet of
 * 875 tags is ~400,000 modules, and drawing each as its own shape took ten
 * seconds and 4MB. Runs of dark modules in a row are merged into one bar.
 */
function drawQr(page: PDFPage, text: string, x: number, y: number, size: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cell = size / n;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  let path = "";
  for (let row = 0; row < n; row++) {
    let col = 0;
    while (col < n) {
      if (!qr.modules.get(row, col)) {
        col++;
        continue;
      }
      let run = 1;
      while (col + run < n && qr.modules.get(row, col + run)) run++;
      // drawSvgPath's origin is the top-left of the path, y growing downward.
      path += `M${r(col * cell)} ${r(row * cell)}h${r(run * cell)}v${r(cell)}h${r(-run * cell)}z`;
      col += run;
    }
  }
  page.drawSvgPath(path, { x, y: y + size, color: INK, borderWidth: 0 });
}

function drawCutLines(page: PDFPage) {
  for (let c = 0; c <= COLS; c++) {
    const x = MARGIN + c * CELL_W;
    page.drawLine({ start: { x, y: MARGIN }, end: { x, y: A4.height - MARGIN }, thickness: 0.4, color: CUT, dashArray: [3, 3] });
  }
  for (let r = 0; r <= ROWS; r++) {
    const y = MARGIN + r * CELL_H;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y }, thickness: 0.4, color: CUT, dashArray: [3, 3] });
  }
}

function drawTag(page: PDFPage, assets: Assets, logo: PDFImage | null, tag: TagUnit, col: number, row: number) {
  const { display, sans } = assets.fonts;
  const left = MARGIN + col * CELL_W;
  const top = A4.height - MARGIN - row * CELL_H;
  const cx = left + CELL_W / 2;
  const inner = CELL_W - PAD * 2;

  // Placed top-down from a fixed budget (cell is ~262pt tall) so the QR
  // lands in the same place whatever the title length or logo shape.
  // Where to punch the string hole.
  page.drawCircle({ x: cx, y: top - 12, size: HOLE_RADIUS, borderColor: CUT, borderWidth: 0.5 });
  let y = top - 24;

  // A wide logo that is also tall (Valentina Karellas's handwritten script)
  // fits the strip only as a scribble; the set name reads better than that.
  const fittedWidth = logo ? logo.width * Math.min(LOGO_BOX.width / logo.width, LOGO_BOX.height / logo.height) : 0;
  const legible = logo !== null && (fittedWidth >= 45 || logo.width / logo.height < 1.2);
  if (logo && legible) {
    drawImageFitted(page, logo, cx, y, LOGO_BOX);
  } else {
    const name = safeText(sans, tag.brandName.toUpperCase());
    const size = sans.widthOfTextAtSize(name, 7) + 1.4 * (name.length - 1) > inner ? 6 : 7;
    drawTracked(page, name, sans, size, cx, y - LOGO_BOX.height / 2 - 3, 1.4, MUTED);
  }
  y -= LOGO_BOX.height + 9;
  page.drawLine({ start: { x: cx - 12, y }, end: { x: cx + 12, y }, thickness: 0.5, color: RULE });
  y -= 17;

  // Title in the display serif, up to two lines, with the fibre composition
  // tucked directly under it. The block is three lines tall whatever the
  // title needs, so the size, price and QR sit in the same place on every tag.
  const titleSize = 10.5;
  const lineH = 12.5;
  const titleLines = wrap(display, tag.productTitle, titleSize, inner, 2);
  let ty = y;
  for (const line of titleLines) {
    drawCentered(page, line, display, titleSize, cx, ty);
    ty -= lineH;
  }
  // A long statement is cut with an ellipsis rather than wrapped.
  const [composition] = tag.fibreComposition ? wrap(sans, tag.fibreComposition, 6.5, inner, 1) : [null];
  if (composition) drawCentered(page, composition, sans, 6.5, cx, ty + 2, MUTED);
  y -= 3 * lineH + 4;

  const sizeLabel = !tag.size || /^one\s*size$/i.test(tag.size) ? "One size" : `Size ${tag.size}`;
  const meta = [tag.colour, sizeLabel].filter(Boolean).join("  ·  ");
  drawCentered(page, safeText(sans, meta), sans, 7.5, cx, y, MUTED);
  y -= 14;
  drawCentered(page, money(tag.priceGbp), sans, 11, cx, y);
  y -= 11;

  const qrY = y - QR_SIZE;
  drawQr(page, `${siteOrigin()}/popup/tag/${tag.unitCode}`, cx - QR_SIZE / 2, qrY, QR_SIZE);
  drawTracked(page, tag.unitCode, sans, 7.5, cx, qrY - 12, 1.8);

  // Footer, two short lines so it fits the narrow tag.
  drawTracked(page, "SIFTAG POP-UP", sans, 5, cx, qrY - 25, 1, MUTED);
  drawTracked(page, "FABRICA X · KING'S CROSS", sans, 5, cx, qrY - 32, 1, MUTED);
}

/** One page run per brand (a new sheet whenever the brand changes), 12 tags a sheet, cut lines between. */
export async function renderTagsPdf(tags: TagUnit[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Siftag Pop-Up garment tags");
  const assets = await loadAssets(doc);

  let page: PDFPage | null = null;
  let slot = 0;
  let currentBrand: string | null = null;

  for (const tag of tags) {
    if (!page || tag.brandId !== currentBrand || slot === COLS * ROWS) {
      page = doc.addPage([A4.width, A4.height]);
      drawCutLines(page);
      slot = 0;
      currentBrand = tag.brandId;
    }
    const logo = await brandLogo(doc, assets, tag.brandSlug);
    drawTag(page, assets, logo, tag, slot % COLS, Math.floor(slot / COLS));
    slot++;
  }

  if (!page) {
    const empty = doc.addPage([A4.width, A4.height]);
    drawCentered(empty, "No tags to print: no ticked, approved units yet.", assets.fonts.sans, 11, A4.width / 2, A4.height / 2, MUTED);
  }

  return doc.save();
}
