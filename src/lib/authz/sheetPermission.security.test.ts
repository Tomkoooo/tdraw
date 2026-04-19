import mongoose from "mongoose";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/models/Sheet", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("@/lib/models/SheetGrant", () => ({
  default: { findOne: vi.fn() },
}));
vi.mock("@/lib/models/Folder", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("@/lib/models/FolderAccess", () => ({
  default: { findOne: vi.fn() },
}));
vi.mock("@/lib/models/OrganizationMember", () => ({
  default: { findOne: vi.fn() },
}));

import Sheet from "@/lib/models/Sheet";
import SheetGrant from "@/lib/models/SheetGrant";
import { getEffectiveSheetAccess, requireSheetPermission } from "./sheet";

function mockSheetLean(doc: Record<string, unknown> | null) {
  const leanBody = doc
    ? {
        userId: doc.userId,
        folderId: doc.folderId,
        organizationId: doc.organizationId,
      }
    : null;
  vi.mocked(Sheet.findById).mockReturnValue({
    lean: vi.fn().mockResolvedValue(doc),
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(leanBody),
    }),
  } as never);
}

function mockGrant(grant: Record<string, unknown> | null) {
  vi.mocked(SheetGrant.findOne).mockReturnValue({
    lean: vi.fn().mockResolvedValue(grant),
  } as never);
}

describe("sheet access security (mocked persistence)", () => {
  const ownerId = new mongoose.Types.ObjectId();
  const intruderId = new mongoose.Types.ObjectId().toString();
  const sheetId = new mongoose.Types.ObjectId().toString();

  const personalSheet = {
    _id: sheetId,
    userId: ownerId,
    title: "Note",
    organizationId: undefined,
    folderId: undefined,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not grant access to a user who is not owner and has no grant or org membership", async () => {
    mockSheetLean(personalSheet);
    mockGrant(null);

    await expect(getEffectiveSheetAccess(intruderId, sheetId)).resolves.toBeNull();
    await expect(requireSheetPermission(intruderId, sheetId, "read")).rejects.toThrow("Forbidden");
  });

  it("reader grant cannot write or delete", async () => {
    mockSheetLean(personalSheet);
    mockGrant({
      role: "reader",
      via: "share",
      allowForwardShare: false,
    });

    await expect(requireSheetPermission(intruderId, sheetId, "read")).resolves.toBeDefined();
    await expect(requireSheetPermission(intruderId, sheetId, "write")).rejects.toThrow("Forbidden");
    await expect(requireSheetPermission(intruderId, sheetId, "delete")).rejects.toThrow("Forbidden");
  });

  it("editor share grant cannot delete or re-share without allowForwardShare", async () => {
    mockSheetLean(personalSheet);
    mockGrant({
      role: "editor",
      via: "share",
      allowForwardShare: false,
    });

    await expect(requireSheetPermission(intruderId, sheetId, "write")).resolves.toBeDefined();
    await expect(requireSheetPermission(intruderId, sheetId, "delete")).rejects.toThrow("Forbidden");
    await expect(requireSheetPermission(intruderId, sheetId, "share")).rejects.toThrow("Forbidden");
  });

  it("author without allowForwardShare cannot share", async () => {
    mockSheetLean(personalSheet);
    mockGrant({
      role: "author",
      via: "share",
      allowForwardShare: false,
    });

    await expect(requireSheetPermission(intruderId, sheetId, "write")).resolves.toBeDefined();
    await expect(requireSheetPermission(intruderId, sheetId, "share")).rejects.toThrow("Forbidden");
  });
});
