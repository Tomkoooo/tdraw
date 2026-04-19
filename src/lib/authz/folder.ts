import mongoose from "mongoose";
import Folder from "@/lib/models/Folder";
import FolderAccess from "@/lib/models/FolderAccess";
import type { FolderPermissionLevel } from "@/lib/models/FolderAccess";
import { getOrgMembership } from "./org";

const levelRank: Record<FolderPermissionLevel, number> = {
  hidden: 0,
  view: 1,
  read_only: 2,
  full: 3,
};

/** Minimum level across chain (most restrictive wins). */
export async function effectiveFolderLevelForUser(
  userId: string,
  folderId: string | null | undefined,
  opts: { organizationId?: string | null }
): Promise<FolderPermissionLevel | "owner_bypass"> {
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

  let minRank = 3;

  for (const fid of chain) {
    const row = await Folder.findById(fid).select("ownerUserId organizationId").lean();
    if (!row) continue;

    if (row.ownerUserId && String(row.ownerUserId) === userId) {
      return "owner_bypass";
    }

    const acc = await FolderAccess.findOne({
      folderId: new mongoose.Types.ObjectId(fid),
      userId: new mongoose.Types.ObjectId(userId),
    })
      .select("level")
      .lean();

    if (row.organizationId && String(row.organizationId) === (opts.organizationId ?? "")) {
      const orgRole = await getOrgMembership(userId, String(row.organizationId));
      if (!acc && orgRole) {
        const baseline: FolderPermissionLevel =
          orgRole === "guest" ? "read_only" : orgRole === "member" ? "full" : "full";
        minRank = Math.min(minRank, levelRank[baseline]);
        continue;
      }
    }

    if (acc?.level) {
      minRank = Math.min(minRank, levelRank[acc.level as FolderPermissionLevel]);
    } else if (row.organizationId) {
      minRank = Math.min(minRank, levelRank.full);
    }
  }

  const inv: Record<number, FolderPermissionLevel> = {
    0: "hidden",
    1: "view",
    2: "read_only",
    3: "full",
  };
  return inv[minRank] ?? "hidden";
}

export function folderAllowsRead(level: FolderPermissionLevel | "owner_bypass"): boolean {
  if (level === "owner_bypass") return true;
  return levelRank[level] >= levelRank.view;
}

export function folderAllowsWrite(level: FolderPermissionLevel | "owner_bypass"): boolean {
  if (level === "owner_bypass") return true;
  return levelRank[level] >= levelRank.full;
}
