import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  output: "standalone",
  // `next build` runs from packages/web; trace from the repo root so workspace packages are included.
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  transpilePackages: ["@hitl/shared", "@hitl/db"],
  poweredByHeader: false,
};

export default config;
