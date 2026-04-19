import mongoose, { Schema, Document } from "mongoose";

export interface ISheet extends Document {
  /** Owner of the sheet (personal or org sheet creator). */
  userId: mongoose.Types.ObjectId;
  title: string;
  canvasState: unknown;
  previewImage?: string;
  folderId?: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  /** Monotonic server version for optimistic offline/realtime sync (increment on save). */
  contentVersion: number;
  /** User-defined order in drive lists (lower = earlier). */
  sortIndex: number;
  pinned?: boolean;
  /** Soft-delete: when set, sheet is in trash. */
  deletedAt?: Date;
  /** Approximate serialized canvas size in bytes (updated on save). */
  approxBytes?: number;
  /** User who last persisted canvas changes (best-effort contributor signal). */
  lastSavedByUserId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SheetSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, default: "Untitled Note" },
    canvasState: { type: Schema.Types.Mixed, default: {} },
    previewImage: { type: String },
    folderId: { type: Schema.Types.ObjectId, ref: "Folder", index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", index: true },
    contentVersion: { type: Number, default: 0 },
    sortIndex: { type: Number, default: 0 },
    pinned: { type: Boolean, default: false },
    deletedAt: { type: Date, index: true },
    approxBytes: { type: Number, default: 0 },
    lastSavedByUserId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  },
  { timestamps: true }
);

SheetSchema.index({ userId: 1, folderId: 1, sortIndex: 1, updatedAt: -1 });
SheetSchema.index({ organizationId: 1, folderId: 1, sortIndex: 1, updatedAt: -1 });

export default mongoose.models.Sheet || mongoose.model<ISheet>("Sheet", SheetSchema);
