import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Files read at render time: policy Markdown (src/lib/policies/load.ts) and certificate fonts.
  outputFileTracingIncludes: {
    "/*": ["./docs/policies/*.md"],
    // Certificate PDFs embed these fonts (src/lib/certificates/pdf.ts).
    "/api/certificates/**": ["./src/lib/certificates/fonts/*.ttf"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
