import mongoose from "mongoose";
import Folder from "@/lib/models/Folder";
import FolderAccess from "@/lib/models/FolderAccess";
import SheetAccess from "@/lib/models/SheetAccess";
import type { FolderPermissionLevel } from "@/lib/models/FolderAccess";
import type { OrgMemberRole } from "@/lib/models/Organization";
import { getOrgMembership, requireOrgMember } from "./org";

const levelRank: Record<FolderPermissionLevel, number> = {
  hidden: 0,
  view: 1,
  read_only: 2,
  full: 3,
};

type EffectiveFolderLevel = FolderPermissionLevel | "owner_bypass";

function baselineFromRole(role: OrgMemberRole): FolderPermissionLevel {
  if (role === "guest") return "read_only";
  return "full";
}

/**
 * Resolve inherited policy with child override semantics:
 * baseline -> parent explicit -> ... -> child explicit (last explicit wins).
 */
export function resolveInheritedLevel(
  baseline: FolderPermissionLevel,
  explicitLevelsFromRootToLeaf: Array<FolderPermissionLevel | null | undefined>,
): FolderPermissionLevel {
  let out = baseline;
  for (const lvl of explicitLevelsFromRootToLeaf) {
    if (lvl) out = lvl;
  }
  return out;
}

async function explicitFolderRule(
  folderId: string,
  userId: string,
  orgRole: OrgMemberRole | null,
): Promise<FolderPermissionLevel | null> {
  const byUser = await FolderAccess.findOne({
    folderId: new mongoose.Types.ObjectId(folderId),
    userId: new mongoose.Types.ObjectId(userId),
  })
    .select("level")
    .lean();
  if (byUser?.level) return byUser.level as FolderPermissionLevel;
  if (!orgRole) return null;
  const byRole = await FolderAccess.findOne({
    folderId: new mongoose.Types.ObjectId(folderId),
    role: orgRole,
  })
    .select("level")
    .lean();
  return byRole?.level ? (byRole.level as FolderPermissionLevel) : null;
}

/** Inherited permissions with child override (explicit child rule replaces inherited level). */
export async function effectiveFolderLevelForUser(
  userId: string,
  folderId: string | null | undefined,
  opts: { organizationId?: string | null }
): Promise<EffectiveFolderLevel> {
  if (!folderId) return "full";

  const chain: string[] = [];
  let current: string | null = folderId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    const doc = (await Folder.findById(current).select("parentFolderId").lean()) as {
      parentFolderId?: mongoose.Types.ObjectId | null;
    } | null;
    if (!doc?.parentFolderId) {
      current = null;
    } else {
      current = String(doc.parentFolderId);
    }
  }

  const orgRole = opts.organizationId ? await requireOrgMember(userId, opts.organizationId) : null;
  const baseline = orgRole ? baselineFromRole(orgRole) : "full";
  const explicitLevels: FolderPermissionLevel[] = [];

  for (const fid of [...chain].reverse()) {
    const row = await Folder.findById(fid).select("ownerUserId organizationId").lean();
    if (!row) continue;

    if (row.ownerUserId && String(row.ownerUserId) === userId) {
      return "owner_bypass";
    }

    const explicit = await explicitFolderRule(fid, userId, orgRole);
    if (explicit) {
      explicitLevels.push(explicit);
    }
  }
  return resolveInheritedLevel(baseline, explicitLevels);
}

function readRank(level: EffectiveFolderLevel) {
  if (level === "owner_bypass") return 999;
  return levelRank[level];
}

export async function effectiveSheetLevelForUser(
  userId: string,
  sheetId: string,
  opts: { organizationId?: string | null; folderId?: string | null }
): Promise<EffectiveFolderLevel> {
  const folderLevel = await effectiveFolderLevelForUser(userId, opts.folderId ?? null, {
    organizationId: opts.organizationId ?? null,
  });
  if (folderLevel === "owner_bypass") return "owner_bypass";

  if (!opts.organizationId) return folderLevel;
  const orgRole = await getOrgMembership(userId, opts.organizationId);
  const byUser = await SheetAccess.findOne({
    sheetId: new mongoose.Types.ObjectId(sheetId),
    userId: new mongoose.Types.ObjectId(userId),
  })
    .select("level")
    .lean();
  const explicit = byUser?.level
    ? (byUser.level as FolderPermissionLevel)
    : orgRole
      ? ((await SheetAccess.findOne({
          sheetId: new mongoose.Types.ObjectId(sheetId),
          role: orgRole,
        })
          .select("level")
          .lean())?.level as FolderPermissionLevel | undefined)
      : undefined;
  return explicit ?? folderLevel;
}

export function folderAllowsRead(level: FolderPermissionLevel | "owner_bypass"): boolean {
  return readRank(level) >= levelRank.view;
}

export function folderAllowsWrite(level: FolderPermissionLevel | "owner_bypass"): boolean {
  return readRank(level) >= levelRank.full;
}
