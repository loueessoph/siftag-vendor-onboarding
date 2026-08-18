/**
 * Shopify catalogue ingest.
 *
 * Most Shopify stores serve /products.json publicly, on the custom domain as
 * well as the myshopify one, so no app install or API key is needed. We
 * paginate until a page comes back empty.
 */

export type ScrapedVariant = {
  shopifyVariantId: string;
  vendorSku: string | null;
  barcode: string | null;
  size: string | null;
  colour: string | null;
  onlinePrice: number | null;
};

export type ScrapedProduct = {
  shopifyProductId: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  productType: string | null;
  /** Set where the item can't be sold at a physical pop-up. */
  exclusionReason: string | null;
  variants: ScrapedVariant[];
};

type RawVariant = {
  id: number;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  sku: string | null;
  barcode?: string | null;
  price: string;
  requires_shipping: boolean;
};

type RawProduct = {
  id: number;
  title: string;
  handle: string;
  product_type: string | null;
  options: { name: string; values: string[] }[];
  images: { src: string }[];
  variants: RawVariant[];
};

/* Colour ------------------------------------------------------------------- */

// Colour is not always a Shopify option. India Grace publishes each colourway
// as its own product with a single Size option, which leaves three products
// all called "Cordelia Top" — indistinguishable in a grid, and three separate
// fibre compositions to type blind. The colour is recoverable from the handle
// or the vendor SKU, so we recover it.

const COLOUR_WORDS = [
  "skyblue", "sky-blue", "navy", "white", "black", "pink", "blue", "cream",
  "ivory", "beige", "ecru", "stone", "sand", "camel", "tan", "brown", "grey",
  "gray", "charcoal", "green", "sage", "olive", "khaki", "red", "burgundy",
  "rust", "yellow", "butter", "mustard", "orange", "peach", "coral", "purple",
  "lilac", "lavender", "mint", "teal", "silver", "gold", "natural", "oatmeal",
];

// Only codes we are sure of. An unknown code yields null rather than a guess —
// a wrong colour on a printed tag is worse than no colour.
const SKU_COLOUR_CODES: Record<string, string> = {
  WHT: "White", BLK: "Black", PNK: "Pink", BLU: "Blue", NVY: "Navy",
  CRM: "Cream", IVY: "Ivory", BGE: "Beige", ECR: "Ecru", GRY: "Grey",
  GRN: "Green", SGE: "Sage", OLV: "Olive", RED: "Red", BRG: "Burgundy",
  RST: "Rust", YEL: "Yellow", BYL: "Butter Yellow", MST: "Mustard",
  PCH: "Peach", CRL: "Coral", LIL: "Lilac", LAV: "Lavender", MNT: "Mint",
  TEA: "Teal", TAN: "Tan", BRN: "Brown", CHR: "Charcoal", CML: "Camel",
  STN: "Stone", NAT: "Natural",
};

function titleCase(word: string): string {
  return word
    .split(/[-\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Looks for a known colour word anywhere in the handle. */
export function colourFromHandle(handle: string): string | null {
  const h = handle.toLowerCase();
  // Longest first, so "skyblue" wins over "blue".
  const match = [...COLOUR_WORDS]
    .sort((a, b) => b.length - a.length)
    .find((c) => h.includes(c));
  if (!match) return null;
  if (match === "skyblue" || match === "sky-blue") return "Sky Blue";
  return titleCase(match);
}

/** Reads a colour code out of a dash-separated vendor SKU. */
export function colourFromSku(sku: string | null): string | null {
  if (!sku) return null;
  for (const part of sku.toUpperCase().split(/[-_\s]+/)) {
    const hit = SKU_COLOUR_CODES[part];
    if (hit) return hit;
  }
  return null;
}

export function deriveColour(
  handle: string,
  vendorSku: string | null,
  optionColour: string | null
): string | null {
  // A real Shopify colour option always wins over anything inferred.
  return optionColour ?? colourFromHandle(handle) ?? colourFromSku(vendorSku);
}

/* Options ------------------------------------------------------------------ */

/** Maps Shopify's positional option1/2/3 onto named size and colour. */
function readOptions(product: RawProduct, variant: RawVariant) {
  const values = [variant.option1, variant.option2, variant.option3];
  let size: string | null = null;
  let colour: string | null = null;

  product.options.forEach((option, i) => {
    const name = option.name.trim().toLowerCase();
    const value = values[i];
    if (!value) return;
    if (name === "size") size = value;
    else if (name === "color" || name === "colour") colour = value;
  });

  return { size, colour };
}

/* Exclusions --------------------------------------------------------------- */

/**
 * Items that can't be sold across a physical till. Gift cards are the reliable
 * case — Shopify marks them requires_shipping: false, which nothing else in a
 * clothing catalogue is.
 */
export function exclusionReasonFor(product: RawProduct): string | null {
  if (product.variants.length === 0) return "No variants";
  if (product.variants.every((v) => !v.requires_shipping)) {
    return "Not a physical product (gift card or similar)";
  }
  return null;
}

/* Till codes --------------------------------------------------------------- */

/**
 * The code printed on the tag and typed into the till. Always ours, never the
 * brand's: two brands can each ship a "TP-01", and a collision would corrupt
 * the payout join rather than fail visibly.
 */
export function generateSku(brandCode: string, n: number): string {
  return `SFTG-${brandCode.toUpperCase()}-${String(n).padStart(3, "0")}`;
}

/* Fetch -------------------------------------------------------------------- */

export function normaliseDomain(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

export async function fetchShopifyCatalogue(
  domain: string,
  { maxPages = 20 }: { maxPages?: number } = {}
): Promise<ScrapedProduct[]> {
  const host = normaliseDomain(domain);
  const out: ScrapedProduct[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(
      `https://${host}/products.json?limit=250&page=${page}`,
      { headers: { accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) {
      throw new Error(
        `${host} returned ${res.status} for products.json. Is it a Shopify store?`
      );
    }

    const body = (await res.json()) as { products?: RawProduct[] };
    const products = body.products ?? [];
    if (products.length === 0) break;

    for (const product of products) {
      out.push({
        shopifyProductId: String(product.id),
        title: product.title,
        handle: product.handle,
        imageUrl: product.images[0]?.src ?? null,
        productType: product.product_type?.trim() || null,
        exclusionReason: exclusionReasonFor(product),
        variants: product.variants.map((variant) => {
          const { size, colour } = readOptions(product, variant);
          const vendorSku = variant.sku?.trim() || null;
          return {
            shopifyVariantId: String(variant.id),
            vendorSku,
            barcode: variant.barcode?.trim() || null,
            size,
            colour: deriveColour(product.handle, vendorSku, colour),
            onlinePrice: Number.isFinite(Number(variant.price))
              ? Number(variant.price)
              : null,
          };
        }),
      });
    }

    if (products.length < 250) break;
  }

  return out;
}
