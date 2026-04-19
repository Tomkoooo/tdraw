import mongoose, { Schema, Document } from "mongoose";
import type { SheetShareRole } from "./SheetInvitation";

export type SheetGrantVia = "owner" | "share" | "org";

export interface ISheetGrant extends Document {
  sheetId: mongoose.Types.ObjectId;
  granteeUserId: mongoose.Types.ObjectId;
  role: SheetShareRole;
  via: SheetGrantVia;
  /** When via=share, whether this grantee may create new shares (chain). */
  allowForwardShare: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SheetGrantSchema = new Schema(
  {
    sheetId: { type: Schema.Types.ObjectId, ref: "Sheet", required: true, index: true },
    granteeUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["reader", "editor", "author"], required: true },
    via: { type: String, enum: ["owner", "share", "org"], required: true },
    allowForwardShare: { type: Boolean, default: false },
  },
  { timestamps: true }
);

SheetGrantSchema.index({ sheetId: 1, granteeUserId: 1 }, { unique: true });

export default mongoose.models.SheetGrant || mongoose.model<ISheetGrant>("SheetGrant", SheetGrantSchema);
