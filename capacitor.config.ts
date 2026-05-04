import type { CapacitorConfig } from "@capacitor/cli";

/**
 * WebView loads your deployed Next app when `CAPACITOR_SERVER_URL` or `NEXTAUTH_URL` is set.
 * Omit both to load static assets from `webDir` (placeholder only — full app needs a server).
 *
 * @see docs/CAPACITOR_IOS.md
 */
function resolveServerUrl(): string | undefined {
  const raw =
    process.env.CAPACITOR_SERVER_URL?.trim() ||
    process.env.NEXT_PUBLIC_CAPACITOR_SERVER_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim();
  if (!raw) return undefined;
  let base = raw;
  if (!base.startsWith("http://") && !base.startsWith("https://")) {
    base = `https://${base}`;
  }
  return base.replace(/\/$/, "");
}

const serverUrl = resolveServerUrl();

const config: CapacitorConfig = {
  appId: "com.tdraw.app",
  appName: "tDraw",
  webDir: "www",
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith("http://"),
      }
    : undefined,
  ios: {
    contentInset: "automatic",
    scrollEnabled: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    PencilEnhanced: {
      /** Forwarded to native; optional squeeze / overlay tuning later */
      enableSqueezeEvents: true,
    },
  },
};

export default config;
