import type { NextConfig } from "next";

/**
 * In `next dev`, the browser origin is often `https://*.ngrok-free.app` while the Node server
 * still listens on localhost. Next.js blocks cross-origin dev requests and validates Server Action
 * origins unless these hosts are allowlisted. Auth (`NEXTAUTH_URL`, etc.) can be correct and the
 * app still looks "totally broken" over ngrok without this.
 *
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions
 */
const defaultDevTunnelHostPatterns = [
  "*.ngrok-free.app",
  "*.ngrok-free.dev",
  "*.ngrok.io",
  "*.ngrok.app",
];

function devTunnelHostPatterns(): string[] {
  const extra = (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...defaultDevTunnelHostPatterns, ...extra])];
}

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === "development"
    ? { allowedDevOrigins: devTunnelHostPatterns() }
    : {}),
  experimental: {
    serverActions: {
      // Canvas snapshots with embedded PDF page images exceed the default 1 MB limit.
      bodySizeLimit: "40mb",
      ...(process.env.NODE_ENV === "development"
        ? { allowedOrigins: devTunnelHostPatterns() }
        : {}),
    },
  },
};

export default nextConfig;
