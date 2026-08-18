import Image from "next/image";

/** Logo and date stamp, matching the pop-up site's header exactly. */
export function SiteHeader() {
  return (
    <header className="flex items-center justify-between pt-6">
      <a href="https://siftag.com" aria-label="Siftag">
        <Image
          src="/SiftagLogo.png"
          alt="Siftag"
          width={90}
          height={29}
          priority
        />
      </a>
      <span className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
        London · Sept 2026
      </span>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-neutral-200 py-10">
      <div className="flex flex-col items-center gap-4">
        <Image src="/SiftagLogo.png" alt="Siftag" width={72} height={23} />
        <div className="flex items-center gap-6 text-xs uppercase tracking-[0.15em] text-neutral-500">
          <a
            href="https://siftag.com"
            className="transition-colors hover:text-neutral-900"
          >
            siftag.com
          </a>
          <a
            href="mailto:brands@siftag.com"
            className="normal-case tracking-normal transition-colors hover:text-neutral-900"
          >
            brands@siftag.com
          </a>
        </div>
      </div>
    </footer>
  );
}
