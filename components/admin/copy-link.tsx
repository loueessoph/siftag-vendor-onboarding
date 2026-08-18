"use client";

import { useState } from "react";

/** The link you paste into an email. Shown in full so it can be checked. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="border border-neutral-900 p-5">
      <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
        Their private link
      </p>
      <p className="mt-3 break-all font-mono text-xs leading-relaxed text-neutral-900">
        {url}
      </p>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="mt-4 border border-neutral-900 px-4 py-2 text-[11px] uppercase tracking-[0.15em] transition-colors hover:bg-neutral-900 hover:text-white"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
      <p className="mt-4 text-xs leading-relaxed text-neutral-500">
        Anyone with this link can see and edit this brand&apos;s list. Send it
        to them directly: don&apos;t post it anywhere.
      </p>
    </div>
  );
}
