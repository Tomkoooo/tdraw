export type SheetCard = {
  _id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  previewImage: string | null;
  folderId?: string | null;
  pinned?: boolean;
  approxBytes?: number;
  userId?: string | null;
};

export type FolderRow = {
  _id: string;
  name: string;
  parentFolderId: string | null;
  pinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
};
