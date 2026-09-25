"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Clipboard API where the page is allowed it (https), the old selection trick elsewhere. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * A tag code that copies itself when tapped and says so for a moment.
 * `children` is what it looks like at rest (dot + code); the flash replaces it.
 */
export function CopyCode({ code, className = "", children }: { code: string; className?: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(code)) setCopied(true);
      }}
      title="Tap to copy the code"
      className={`inline-flex items-center gap-1 rounded px-1 font-mono transition-colors ${copied ? "bg-neutral-900 text-white" : className}`}
    >
      {copied ? "Copied" : children}
    </button>
  );
}
