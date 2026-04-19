import { createHmac, timingSafeEqual } from "crypto";

/**
 * Short-lived signed token for Socket.io auth.
 * Format: `${userId}:${expUnix}:${hmac}` — must match `verifyRealtimeUserToken`.
 */
export function signRealtimeUserToken(
  secret: string,
  userId: string,
  ttlSeconds: number,
): { token: string; expiresIn: number } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${userId}:${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return { token: `${payload}:${sig}`, expiresIn: ttlSeconds };
}

export function verifyRealtimeUserToken(token: string, secret: string): { userId: string } | null {
  const last = token.lastIndexOf(":");
  if (last < 0) return null;
  const payload = token.slice(0, last);
  const sig = token.slice(last + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  const colon = payload.indexOf(":");
  if (colon < 0) return null;
  const userId = payload.slice(0, colon);
  const exp = Number(payload.slice(colon + 1));
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  return { userId };
}
