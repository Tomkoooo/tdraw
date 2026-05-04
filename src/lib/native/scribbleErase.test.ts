import { describe, expect, it } from "vitest";

import { isLikelyScribbleEraseStroke } from "./scribbleErase";

function zigzag(n: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    pts.push({ x: i * 4, y: i % 2 === 0 ? 0 : 20 });
  }
  return pts;
}

describe("isLikelyScribbleEraseStroke", () => {
  it("detects tight zig-zag", () => {
    expect(isLikelyScribbleEraseStroke(zigzag(40))).toBe(true);
  });

  it("rejects short strokes", () => {
    expect(isLikelyScribbleEraseStroke(zigzag(8))).toBe(false);
  });
});
