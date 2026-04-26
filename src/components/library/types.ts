import type { FolderTreeEntry } from "@/lib/actions/folder";
import type { SheetCard, FolderRow } from "@/components/dashboard/driveTypes";

export type { SheetCard, FolderRow, FolderTreeEntry };

export type LibraryNode = "home" | "drive" | "shared" | "org" | "trash";
export type SharedSub = "with" | "by";
export type DriveSort = "alpha" | "created" | "updated";
export type ViewMode = "grid" | "list";

export type OrgRow = { _id: string; name: string; role: string; createdByUserId: string };

export const DND_NOTE = "n";
export const DND_FOLDER = "f";
export const DND_DROP_F = "df";
export const DND_ROOT_PERSONAL = "r-pers";
export const DND_ROOT_ORG = (orgId: string) => `r-org-${orgId}`;

export function dndIdNote(id: string) {
  return `${DND_NOTE}:${id}` as const;
}
export function dndIdFolder(id: string) {
  return `${DND_FOLDER}:${id}` as const;
}
export function dndIdDropFolder(id: string) {
  return `${DND_DROP_F}:${id}` as const;
}
