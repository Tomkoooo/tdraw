import { describe, it, expect } from "vitest";
import { resolveInheritedLevel } from "./folder";
import type { FolderPermissionLevel } from "@/lib/models/FolderAccess";

describe("resolveInheritedLevel", () => {
  it("returns baseline when no explicit rules exist", () => {
    expect(resolveInheritedLevel("full", [])).toBe("full");
    expect(resolveInheritedLevel("read_only", [null, undefined])).toBe("read_only");
  });

  it("uses child override over inherited parent", () => {
    const chain: Array<FolderPermissionLevel | null> = ["view", null, "hidden"];
    expect(resolveInheritedLevel("full", chain)).toBe("hidden");
  });

  it("allows relaxing a parent restriction when child explicitly opens access", () => {
    const chain: Array<FolderPermissionLevel | null> = ["hidden", "read_only", "full"];
    expect(resolveInheritedLevel("read_only", chain)).toBe("full");
  });
});
