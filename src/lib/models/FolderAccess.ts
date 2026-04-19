import mongoose, { Schema, Document } from "mongoose";

/** Folder ACL: applies to members (org) or explicit users (personal shared folders). */
export type FolderPermissionLevel = "hidden" | "view" | "read_only" | "full";

export interface IFolderAccess extends Document {
  folderId: mongoose.Types.ObjectId;
  /** User subject (personal grants or org member overrides). */
  userId: mongoose.Types.ObjectId;
  level: FolderPermissionLevel;
  createdAt: Date;
  updatedAt: Date;
}

const FolderAccessSchema = new Schema(
  {
    folderId: { type: Schema.Types.ObjectId, ref: "Folder", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    level: { type: String, enum: ["hidden", "view", "read_only", "full"], required: true },
  },
  { timestamps: true }
);

FolderAccessSchema.index({ folderId: 1, userId: 1 }, { unique: true });

export default mongoose.models.FolderAccess || mongoose.model<IFolderAccess>("FolderAccess", FolderAccessSchema);
