import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signRealtimeUserToken, verifyRealtimeUserToken } from "./hmacToken";

describe("signRealtimeUserToken / verifyRealtimeUserToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("roundtrips a valid token", () => {
    const { token, expiresIn } = signRealtimeUserToken("s3cret", "user-abc", 600);
    expect(expiresIn).toBe(600);
    expect(verifyRealtimeUserToken(token, "s3cret")).toEqual({ userId: "user-abc" });
  });

  it("rejects tampered payload", () => {
    const { token } = signRealtimeUserToken("s3cret", "user-abc", 600);
    const tampered = token.replace("user-abc", "user-zzz");
    expect(verifyRealtimeUserToken(tampered, "s3cret")).toBeNull();
  });

  it("rejects wrong secret", () => {
    const { token } = signRealtimeUserToken("s3cret", "user-abc", 600);
    expect(verifyRealtimeUserToken(token, "other")).toBeNull();
  });

  it("rejects expired token", () => {
    const { token } = signRealtimeUserToken("s3cret", "user-abc", 5);
    vi.advanceTimersByTime(6_000);
    expect(verifyRealtimeUserToken(token, "s3cret")).toBeNull();
  });

  it("rejects malformed token", () => {
    expect(verifyRealtimeUserToken("not-a-token", "s3cret")).toBeNull();
    expect(verifyRealtimeUserToken("", "s3cret")).toBeNull();
  });

  it("rejects forged token with extra payload segments (injection-style)", () => {
    const { token } = signRealtimeUserToken("s3cret", "user-abc", 600);
    const forged = `${token}:extra:segments`;
    expect(verifyRealtimeUserToken(forged, "s3cret")).toBeNull();
  });

  it("rejects truncated or elongated HMAC", () => {
    const { token } = signRealtimeUserToken("s3cret", "user-abc", 600);
    const last = token.lastIndexOf(":");
    const payload = token.slice(0, last);
    const sig = token.slice(last + 1);
    expect(verifyRealtimeUserToken(`${payload}:${sig.slice(0, 8)}`, "s3cret")).toBeNull();
    expect(verifyRealtimeUserToken(`${payload}:${sig}00`, "s3cret")).toBeNull();
  });
});
