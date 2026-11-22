import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  output: "standalone",
  // `next build` runs from packages/web; trace from the repo root so workspace packages are included.
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  transpilePackages: ["@hitl/shared", "@hitl/db"],
  poweredByHeader: false,
  // Keep the dev badge away from the sidebar user card.
  devIndicators: { position: "bottom-right" },
  async headers() {
    return [
      {
        // The browser must always check for a new service worker, never use a cached copy.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default config;
