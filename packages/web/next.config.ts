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
};

export default config;
