import { describe, it, expect } from "vitest";
import { roleMeets, type EffectiveSheetAccess } from "./types";

function access(partial: Partial<EffectiveSheetAccess> & Pick<EffectiveSheetAccess, "actor" | "role">): EffectiveSheetAccess {
  return {
    allowForwardShare: false,
    ...partial,
  };
}

describe("roleMeets", () => {
  it("grants all ops to owner", () => {
    const a = access({ actor: "owner", role: "owner" });
    expect(roleMeets("read", a)).toBe(true);
    expect(roleMeets("write", a)).toBe(true);
    expect(roleMeets("delete", a)).toBe(true);
    expect(roleMeets("share", a)).toBe(true);
  });

  it("maps read/write/title by share role", () => {
    const reader = access({ actor: "share", role: "reader" });
    expect(roleMeets("read", reader)).toBe(true);
    expect(roleMeets("write", reader)).toBe(false);

    const editor = access({ actor: "share", role: "editor" });
    expect(roleMeets("write", editor)).toBe(true);
    expect(roleMeets("title", editor)).toBe(true);
    expect(roleMeets("delete", editor)).toBe(false);
  });

  it("allows delete for org admin", () => {
    const org = access({ actor: "org", role: "editor", orgMemberRole: "admin" });
    expect(roleMeets("delete", org)).toBe(true);
  });

  it("denies delete for non-admin org member", () => {
    const org = access({ actor: "org", role: "editor", orgMemberRole: "member" });
    expect(roleMeets("delete", org)).toBe(false);
  });

  it("allows share for org admin", () => {
    const org = access({ actor: "org", role: "reader", orgMemberRole: "admin" });
    expect(roleMeets("share", org)).toBe(true);
  });

  it("allows share for author with forward share", () => {
    const a = access({ actor: "share", role: "author", allowForwardShare: true });
    expect(roleMeets("share", a)).toBe(true);
  });

  it("denies share for author without forward share", () => {
    const a = access({ actor: "share", role: "author", allowForwardShare: false });
    expect(roleMeets("share", a)).toBe(false);
  });

  it("treats unknown / forged role strings as no capability (privilege escalation guard)", () => {
    const forged = access({ actor: "share", role: "superadmin" as "reader" });
    expect(roleMeets("read", forged)).toBe(false);
    expect(roleMeets("write", forged)).toBe(false);
    expect(roleMeets("share", forged)).toBe(false);
  });
});
