import mongoose from "mongoose";
import Sheet from "@/lib/models/Sheet";
import SheetGrant from "@/lib/models/SheetGrant";
import type { SheetShareRole } from "@/lib/models/SheetInvitation";
import type { EffectiveSheetAccess, SheetOp } from "./types";
import { roleMeets } from "./types";
import { getOrgMembership } from "./org";
import { effectiveFolderLevelForUser, folderAllowsRead, folderAllowsWrite } from "./folder";

function mapOrgRoleToSheetShare(orgRole: "admin" | "member" | "guest"): SheetShareRole {
  if (orgRole === "guest") return "reader";
  if (orgRole === "member") return "editor";
  return "author";
}

export async function getEffectiveSheetAccess(
  userId: string,
  sheetId: string
): Promise<EffectiveSheetAccess | null> {
  const sheet = await Sheet.findById(sheetId).lean();
  if (!sheet) return null;

  if (String(sheet.userId) === userId) {
    return {
      actor: "owner",
      role: "owner",
      allowForwardShare: true,
      organizationId: sheet.organizationId ? String(sheet.organizationId) : undefined,
    };
  }

  const grant = await SheetGrant.findOne({
    sheetId: new mongoose.Types.ObjectId(sheetId),
    granteeUserId: new mongoose.Types.ObjectId(userId),
  }).lean();

  if (grant) {
    return {
      actor: grant.via === "org" ? "org" : "share",
      role: grant.role as SheetShareRole,
      allowForwardShare: grant.allowForwardShare,
      organizationId: sheet.organizationId ? String(sheet.organizationId) : undefined,
    };
  }

  if (sheet.organizationId) {
    const orgId = String(sheet.organizationId);
    const orgRole = await getOrgMembership(userId, orgId);
    if (orgRole) {
      return {
        actor: "org",
        role: mapOrgRoleToSheetShare(orgRole),
        allowForwardShare: orgRole === "admin",
        organizationId: orgId,
        orgMemberRole: orgRole,
      };
    }
  }

  return null;
}

export async function requireSheetPermission(userId: string, sheetId: string, op: SheetOp) {
  const access = await getEffectiveSheetAccess(userId, sheetId);
  if (!access) throw new Error("Forbidden");

  if (!roleMeets(op, access)) throw new Error("Forbidden");

  const sheet = await Sheet.findById(sheetId).select("folderId organizationId userId").lean();
  if (!sheet) throw new Error("Not found");

  // Direct email shares bypass folder visibility so invitations remain usable.
  if (access.actor === "owner" || access.actor === "share") return access;

  const folderLevel = await effectiveFolderLevelForUser(userId, sheet.folderId ? String(sheet.folderId) : undefined, {
    organizationId: sheet.organizationId ? String(sheet.organizationId) : undefined,
  });

  if (op === "read" || op === "title") {
    if (!folderAllowsRead(folderLevel)) throw new Error("Forbidden");
  }
  if (op === "write") {
    if (!folderAllowsWrite(folderLevel)) throw new Error("Forbidden");
  }

  return access;
}
