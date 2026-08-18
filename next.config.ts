import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without this, Turbopack walks up past the repo and picks a stray lockfile
  // in the home directory as the project root.
  turbopack: { root: path.resolve(".") },
  images: {
    // Vendor catalogue images are hot-linked from the brands' own Shopify CDNs
    // rather than copied into our storage, so the loader has to allow them.
    remotePatterns: [
      { protocol: "https", hostname: "cdn.shopify.com" },
      { protocol: "https", hostname: "**.myshopify.com" },
    ],
  },
};

export default nextConfig;
