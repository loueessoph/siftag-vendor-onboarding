import type { Config } from "tailwindcss";

// The pop-up site keeps its Tailwind config empty and expresses the whole
// design system as utility classes on the default neutral palette. That works
// for one long marketing page; this app has forms, grids, tables and an admin
// area, so the two things the pop-up repeats by hand — the Gilda display face
// and the wider admin container — are named here. Everything else stays stock
// Tailwind so the two codebases still read the same.
export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-gilda)", "serif"],
      },
      maxWidth: {
        // Admin tables need more room than the vendor-facing max-w-xl.
        admin: "80rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
