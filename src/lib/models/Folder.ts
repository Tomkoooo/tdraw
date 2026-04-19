import mongoose, { Schema, Document } from "mongoose";

/** Personal drive folder uses ownerUserId; org folder uses organizationId (exactly one set). */
export interface IFolder extends Document {
  name: string;
  ownerUserId?: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  parentFolderId?: mongoose.Types.ObjectId;
  order: number;
  pinned?: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FolderSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", index: true },
    parentFolderId: { type: Schema.Types.ObjectId, ref: "Folder", index: true },
    order: { type: Number, default: 0 },
    pinned: { type: Boolean, default: false },
    deletedAt: { type: Date, index: true },
  },
  { timestamps: true }
);

FolderSchema.index({ ownerUserId: 1, parentFolderId: 1 });
FolderSchema.index({ organizationId: 1, parentFolderId: 1 });

export default mongoose.models.Folder || mongoose.model<IFolder>("Folder", FolderSchema);
