import type { SheetShareRole } from "@/lib/models/SheetInvitation";
import type { OrgMemberRole } from "@/lib/models/Organization";

export type SheetOp = "read" | "write" | "title" | "delete" | "share";

export type EffectiveSheetActor = "owner" | "share" | "org";

export interface EffectiveSheetAccess {
  actor: EffectiveSheetActor;
  /** Unified capability level (owner supersedes all checks). */
  role: SheetShareRole | "owner";
  allowForwardShare: boolean;
  organizationId?: string;
  orgMemberRole?: OrgMemberRole;
}

const rank: Record<string, number> = {
  reader: 1,
  editor: 2,
  author: 3,
  owner: 4,
};

export function roleMeets(op: SheetOp, access: EffectiveSheetAccess): boolean {
  const { role, actor, allowForwardShare } = access;
  if (role === "owner") return true;

  const r = rank[role] ?? 0;

  if (op === "read") return r >= rank.reader;
  if (op === "write") return r >= rank.editor;
  if (op === "title") return r >= rank.editor;
  if (op === "delete") {
    if (actor === "org" && access.orgMemberRole === "admin") return true;
    return false;
  }
  if (op === "share") {
    if (actor === "org" && access.orgMemberRole === "admin") return true;
    if (role === "author" && allowForwardShare) return true;
    return false;
  }
  return false;
}
