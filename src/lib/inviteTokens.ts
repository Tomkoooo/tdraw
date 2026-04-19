import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function generateInviteToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  const hash = sha256Hex(raw);
  return { raw, hash };
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function safeCompareToken(raw: string, storedHash: string): boolean {
  try {
    const h = sha256Hex(raw);
    const a = Buffer.from(h, "hex");
    const b = Buffer.from(storedHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
