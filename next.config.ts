import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // Canvas snapshots with embedded PDF page images exceed the default 1 MB limit.
      bodySizeLimit: "40mb",
    },
  },
};

export default nextConfig;
