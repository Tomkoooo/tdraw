/** True when running inside a Capacitor WebView (not desktop Safari). */
export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

export function getCapacitorPlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  const w = window as unknown as { Capacitor?: { getPlatform?: () => string } };
  const p = w.Capacitor?.getPlatform?.();
  if (p === "ios" || p === "android") return p;
  return "web";
}
