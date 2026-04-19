import { describe, it, expect } from "vitest";
import { generateInviteToken, sha256Hex, safeCompareToken } from "./inviteTokens";

describe("sha256Hex", () => {
  it("is deterministic for utf-8 input", () => {
    expect(sha256Hex("hello")).toBe(sha256Hex("hello"));
    expect(sha256Hex("hello")).toHaveLength(64);
  });
});

describe("generateInviteToken", () => {
  it("returns raw hex and matching hash", () => {
    const { raw, hash } = generateInviteToken();
    expect(raw).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(sha256Hex(raw));
  });

  it("produces distinct raw tokens", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a.raw).not.toBe(b.raw);
  });
});

describe("safeCompareToken", () => {
  it("returns true for matching raw vs stored hash", () => {
    const { raw, hash } = generateInviteToken();
    expect(safeCompareToken(raw, hash)).toBe(true);
  });

  it("returns false for wrong raw", () => {
    const { hash } = generateInviteToken();
    expect(safeCompareToken("wrong", hash)).toBe(false);
  });

  it("returns false for garbage stored hash", () => {
    expect(safeCompareToken("abc", "not-valid-hex")).toBe(false);
  });

  it("returns false for same-length wrong secret (oracle resistance)", () => {
    const { raw, hash } = generateInviteToken();
    const wrongRaw = raw.slice(0, -1) + (raw.endsWith("0") ? "1" : "0");
    expect(wrongRaw).toHaveLength(raw.length);
    expect(safeCompareToken(wrongRaw, hash)).toBe(false);
  });

  it("returns false when stored hash length mismatches SHA-256 hex (64 chars)", () => {
    const { raw } = generateInviteToken();
    const shortHash = "a".repeat(32);
    expect(safeCompareToken(raw, shortHash)).toBe(false);
  });
});

describe("generateInviteToken (token secrecy)", () => {
  it("produces 256-bit raw tokens (64 hex chars) suitable for URL tokens", () => {
    const { raw } = generateInviteToken();
    expect(raw).toHaveLength(64);
    expect(raw).toMatch(/^[0-9a-f]+$/);
  });
});
