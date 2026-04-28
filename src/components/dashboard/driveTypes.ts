export type SheetCard = {
  _id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  previewImage: string | null;
  folderId?: string | null;
  organizationId?: string | null;
  pinned?: boolean;
  approxBytes?: number;
  userId?: string | null;
  accessLevel?: "hidden" | "view" | "read_only" | "full" | "owner_bypass";
  canWriteByPolicy?: boolean;
};

export type FolderRow = {
  _id: string;
  name: string;
  parentFolderId: string | null;
  pinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
  accessLevel?: "hidden" | "view" | "read_only" | "full" | "owner_bypass";
  canWriteByPolicy?: boolean;
};
