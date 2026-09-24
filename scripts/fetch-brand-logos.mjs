// Downloads each brand's logo from their own website and saves a trimmed,
// print-ready PNG at public/brand-logos/<slug>.png for the garment tags
// (lib/tags.ts). Sources were picked by hand from each site's header; run
// again to refresh. Also writes a contact sheet to review them all at once.
//   node scripts/fetch-brand-logos.mjs
import sharp from "sharp";
import fs from "node:fs/promises";

const LOGOS = {
  "aefen-london": "https://www.aefenlondon.com/cdn/shop/files/Asset_1.png",
  "house-of-ador": "https://www.houseofador.com/cdn/shop/files/HOA_1.png",
  "hyli": "https://hyli.co.uk/cdn/shop/files/hyli_eae9e3.png",
  "india-grace-london": "https://indiagracelondon.com/cdn/shop/files/LOGO_-_INDI_300_x_200_px_1bb36a47-d066-46ab-bba5-e2b1a8e38532.svg",
  "julie-may-lingerie": "https://juliemay.co.uk/cdn/shop/files/JM_Logo_1_2.png",
  "laine-hill": "https://lainehill.com/cdn/shop/files/Logo_LAINE_HILL.svg",
  "margen-atelier": "https://margenatelier.com/cdn/shop/files/MARGEN_ATELIER_LOGO_2026_VECTORISE.png",
  "plain-and-simple": "https://www.plainandsimple.com/cdn/shop/files/PLAINANDSIMPLE_Proxima_Nova_Bold_-_Letter_Spaced_High_Res_PNG.png",
  "sariva-rozen": "https://sarivarozen.com/cdn/shop/files/ChatGPT_Image_Aug_31_2026_06_25_35_PM.png",
  "valentina-karellas": "https://valentinakarellas.com/wp-content/uploads/2015/09/valentina_logo.png",
  "yusun-the-label": "https://yusun.dk/cdn/shop/files/1_6c2a07fb-92db-400f-b284-6d8215da23fc.png",
};
const UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" };
// Logos drawn white for a dark site header; recoloured to ink here since tags print on white.
const WHITE_ON_TRANSPARENT = new Set(["hyli"]);
const OUT = new URL("../public/brand-logos/", import.meta.url).pathname;
const MAX_W = 900;

const tiles = [];
for (const [slug, url] of Object.entries(LOGOS)) {
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const input = Buffer.from(await res.arrayBuffer());
    // Rasterise SVGs wide so the print stays crisp; trim empty edges; keep transparency.
    let img = sharp(input, { density: 300 }).png();
    const meta = await img.metadata();
    img = img.trim({ threshold: 10 });
    let trimmed = await img.toBuffer();
    if (WHITE_ON_TRANSPARENT.has(slug)) {
      const m = await sharp(trimmed).metadata();
      const alpha = await sharp(trimmed).ensureAlpha().extractChannel("alpha").toBuffer();
      trimmed = await sharp({ create: { width: m.width, height: m.height, channels: 3, background: "#1a1a1a" } }).joinChannel(alpha).png().toBuffer();
    }
    const out = await sharp(trimmed).resize({ width: MAX_W, withoutEnlargement: true }).png().toBuffer();
    const om = await sharp(out).metadata();
    await fs.writeFile(`${OUT}${slug}.png`, out);
    console.log(`${slug.padEnd(22)} ${String(meta.format).padEnd(5)} ${meta.width}x${meta.height} -> ${om.width}x${om.height} alpha=${om.hasAlpha}`);
    tiles.push({ slug, buf: out });
  } catch (err) {
    console.log(`${slug.padEnd(22)} FAILED ${err.message}`);
  }
}

// Contact sheet: each logo on a light grey tile so white-on-transparent shows up.
const TILE = 300, PADT = 20, cols = 3;
const rows = Math.ceil(tiles.length / cols);
const composites = [];
for (let i = 0; i < tiles.length; i++) {
  const fitted = await sharp(tiles[i].buf).resize({ width: TILE - PADT * 2, height: 120, fit: "inside" }).png().toBuffer();
  const m = await sharp(fitted).metadata();
  const x = (i % cols) * TILE, y = Math.floor(i / cols) * 180;
  composites.push({ input: await sharp({ create: { width: TILE - 8, height: 172, channels: 4, background: "#e8e8e8" } }).png().toBuffer(), left: x + 4, top: y + 4 });
  composites.push({ input: fitted, left: x + Math.round((TILE - m.width) / 2), top: y + 20 + Math.round((120 - m.height) / 2) });
  composites.push({ input: Buffer.from(`<svg width="${TILE}" height="24"><text x="${TILE/2}" y="16" font-size="13" text-anchor="middle" font-family="Helvetica">${tiles[i].slug}</text></svg>`), left: x, top: y + 150 });
}
const sheet = process.argv[2] ?? `${OUT}../../../.contact-sheet.png`;
await sharp({ create: { width: cols * TILE, height: rows * 180, channels: 4, background: "#ffffff" } }).composite(composites).png().toFile(sheet);
console.log("contact sheet:", sheet);
