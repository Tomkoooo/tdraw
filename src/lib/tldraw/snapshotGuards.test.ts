import { describe, expect, it } from "vitest";
import { approxJsonBytes, shouldRejectRemoteSnapshotAsLikelyCorrupt } from "./snapshotGuards";

describe("snapshotGuards", () => {
  it("approxJsonBytes measures serialized size", () => {
    expect(approxJsonBytes({ a: 1 })).toBeGreaterThan(0);
    expect(approxJsonBytes(undefined)).toBe(0);
  });

  it("rejects tiny incoming snapshot when current doc is large", () => {
    const current = {
      store: Object.fromEntries(
        Array.from({ length: 400 }, (_, i) => [`shape:${i}`, { id: `shape:${i}`, type: "geo", x: i, y: i, w: 40, h: 40 }])
      ),
    };
    expect(approxJsonBytes(current)).toBeGreaterThan(2400);
    expect(shouldRejectRemoteSnapshotAsLikelyCorrupt({}, current)).toBe(true);
    expect(shouldRejectRemoteSnapshotAsLikelyCorrupt({ store: { a: 1 } }, current)).toBe(true);
  });

  it("allows small docs to receive small snapshots", () => {
    const current = { store: { page: { id: "page:1" } } };
    expect(shouldRejectRemoteSnapshotAsLikelyCorrupt({ store: { page: { id: "page:2" } } }, current)).toBe(false);
  });
});
