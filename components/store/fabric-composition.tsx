/**
 * The "Fabric composition" strip from siftag.com's product page: one tile
 * per fibre with an icon, the fibre name and its share. Icons are the same
 * files the marketplace uses (public/fabric-icons); regenerated cellulosics
 * such as viscose get a wood block, since that is what they are made from.
 */

import { parseComposition, type CompositionPart } from "@/lib/fibre";

const FILE_ICON: Record<string, string> = {
  cotton: "cotton", "organic cotton": "cotton", "pima cotton": "cotton", "supima cotton": "cotton",
  linen: "linen", flax: "linen",
  wool: "alpaca-wool", "merino wool": "alpaca-wool", "virgin wool": "alpaca-wool", "lambswool": "alpaca-wool",
  alpaca: "alpaca",
  silk: "yarn-ball", mulberry: "yarn-ball", "mulberry silk": "yarn-ball",
  cashmere: "goat", mohair: "goat",
  leather: "leather",
  hemp: "hemp",
  elastane: "elastane", spandex: "elastane", lycra: "elastane",
  polyester: "synthetic", "recycled polyester": "synthetic", nylon: "synthetic", polyamide: "synthetic",
  "recycled nylon": "synthetic", acrylic: "synthetic",
};
const WOOD_BLOCK = new Set(["viscose", "rayon", "modal", "lyocell", "tencel", "ecovero", "bamboo", "cupro", "bamboo viscose"]);

function iconFor(part: CompositionPart): { file?: string; wood?: boolean } {
  const key = part.name.toLowerCase().replace(/\s+/g, " ").trim();
  if (part.fibre?.kind === "regenerated" || WOOD_BLOCK.has(key) || [...WOOD_BLOCK].some((w) => key.endsWith(` ${w}`))) return { wood: true };
  if (FILE_ICON[key]) return { file: FILE_ICON[key] };
  const last = key.split(" ").pop() ?? key;
  if (FILE_ICON[last]) return { file: FILE_ICON[last] };
  if (part.fibre?.kind === "synthetic") return { file: "synthetic" };
  return {};
}

function WoodBlock({ className }: { className?: string }) {
  // A short log seen end-on: growth rings in front, the bark along the side.
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="24" cy="32" rx="14" ry="18" />
      <ellipse cx="24" cy="32" rx="8.5" ry="11" />
      <ellipse cx="24" cy="32" rx="3.5" ry="4.5" />
      <path d="M24 14 H44 C51 14 54 22 54 32 C54 42 51 50 44 50 H24" />
      <path d="M40 18 C44 24 44 40 40 46" />
      <path d="M47 21 C50 26 50 38 47 43" />
    </svg>
  );
}

function GenericFibre({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="32" cy="18" rx="14" ry="6" />
      <ellipse cx="32" cy="46" rx="14" ry="6" />
      <line x1="18" y1="18" x2="18" y2="46" />
      <line x1="46" y1="18" x2="46" y2="46" />
      <path d="M18 28 Q32 34 46 28" />
      <path d="M18 36 Q32 42 46 36" />
    </svg>
  );
}

export function FabricComposition({ composition }: { composition: string | null }) {
  if (!composition) return null;
  // The app's own parser: the one the vendor form and the 90% rule use.
  const parts = parseComposition(composition);
  if (parts.length === 0) return null;
  return (
    <section className="border-t border-gray-100 pt-5">
      <h2 className="text-xs uppercase tracking-widest text-gray-700">Fabric composition</h2>
      <ul className="mt-4 flex flex-wrap gap-8">
        {parts.map((p, i) => {
          const icon = iconFor(p);
          return (
            <li key={`${p.name}-${i}`} className="flex flex-col items-center gap-2 text-center">
              {icon.file ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/fabric-icons/${icon.file}.svg`} alt="" className="h-10 w-10 opacity-60" />
              ) : icon.wood ? (
                <WoodBlock className="h-10 w-10 text-gray-500" />
              ) : (
                <GenericFibre className="h-10 w-10 text-gray-500" />
              )}
              <span className="text-xs uppercase tracking-widest text-gray-700">{p.name}</span>
              {p.pct > 0 && <span className="text-sm text-gray-900">{p.pct}%</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
