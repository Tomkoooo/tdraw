import mongoose, { Schema, Document } from "mongoose";

export interface ISheetPublicLink extends Document {
  sheetId: mongoose.Types.ObjectId;
  tokenHash: string;
  /** When set, link stops working (soft revoke). */
  revokedAt?: Date | null;
  /** Null / missing means the link never expires. */
  expiresAt?: Date | null;
  createdByUserId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SheetPublicLinkSchema = new Schema(
  {
    sheetId: { type: Schema.Types.ObjectId, ref: "Sheet", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    revokedAt: { type: Date, default: null, index: true },
    expiresAt: { type: Date, default: null, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

export default mongoose.models.SheetPublicLink ||
  mongoose.model<ISheetPublicLink>("SheetPublicLink", SheetPublicLinkSchema);
