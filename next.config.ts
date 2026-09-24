import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without this, Turbopack walks up past the repo and picks a stray lockfile
  // in the home directory as the project root.
  turbopack: { root: path.resolve(".") },
  // The tag PDF route reads fonts and brand logos off disk at request time.
  // Vercel's bundler only ships files it can see imported, so name them.
  outputFileTracingIncludes: {
    "/api/admin/tags": ["./public/fonts/**/*", "./public/brand-logos/**/*"],
    "/": ["./public/intro/**/*"],
  },
  images: {
    // Vendor catalogue images are hot-linked from the brands' own Shopify CDNs
    // rather than copied into our storage, so the loader has to allow them.
    remotePatterns: [
      { protocol: "https", hostname: "cdn.shopify.com" },
      { protocol: "https", hostname: "**.myshopify.com" },
      { protocol: "https", hostname: "valentinakarellas.com" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
    // Photos don't change once scraped; keep the resized copies for a week.
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },
};

export default nextConfig;
