"use client";

import { useEffect, useState } from "react";

/**
 * Floating "back to top" on every page. The product list runs to a hundred
 * cards for some brands and the sticky bar only holds the summary, so the
 * way back up shouldn't be a long drag. Appears once the top is out of view.
 *
 * The one round thing in the app, deliberately: it is a control floating
 * over content rather than part of the page's grid, and a square would read
 * as a stray card.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-6 right-6 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg transition-all hover:bg-neutral-700 ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5">
        <path
          d="M5 12.5 10 7.5l5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
