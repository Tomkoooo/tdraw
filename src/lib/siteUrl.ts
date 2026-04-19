/** Canonical site origin for metadata, OG URLs, and sitemap (no trailing slash). */
export function getSiteUrl(): string {
  let base = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || "http://localhost:3000";
  if (!base.startsWith("http")) base = `https://${base}`;
  return base.replace(/\/$/, "");
}
