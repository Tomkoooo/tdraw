import { describe, it, expect } from "vitest";
import { folderAllowsRead, folderAllowsWrite } from "./folder";

/**
 * Folder ACL gates used after sheet-level access — wrong level must not allow read/write.
 */
describe("folderAllowsRead / folderAllowsWrite (security gates)", () => {
  it("denies read when folder is hidden", () => {
    expect(folderAllowsRead("hidden")).toBe(false);
    expect(folderAllowsWrite("hidden")).toBe(false);
  });

  it("allows read from view upward but write only from full (or owner bypass)", () => {
    expect(folderAllowsRead("view")).toBe(true);
    expect(folderAllowsWrite("view")).toBe(false);

    expect(folderAllowsRead("read_only")).toBe(true);
    expect(folderAllowsWrite("read_only")).toBe(false);

    expect(folderAllowsRead("full")).toBe(true);
    expect(folderAllowsWrite("full")).toBe(true);
  });

  it("owner_bypass allows both read and write", () => {
    expect(folderAllowsRead("owner_bypass")).toBe(true);
    expect(folderAllowsWrite("owner_bypass")).toBe(true);
  });
});
