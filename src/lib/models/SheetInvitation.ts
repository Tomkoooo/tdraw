import mongoose, { Schema, Document } from "mongoose";

export type SheetShareRole = "reader" | "editor" | "author";

export interface ISheetInvitation extends Document {
  sheetId: mongoose.Types.ObjectId;
  email: string;
  role: SheetShareRole;
  allowForwardShare: boolean;
  tokenHash: string;
  expiresAt: Date;
  createdByUserId: mongoose.Types.ObjectId;
  acceptedAt?: Date;
  acceptedByUserId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SheetInvitationSchema = new Schema(
  {
    sheetId: { type: Schema.Types.ObjectId, ref: "Sheet", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: { type: String, enum: ["reader", "editor", "author"], required: true },
    allowForwardShare: { type: Boolean, default: false },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    acceptedAt: { type: Date },
    acceptedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.models.SheetInvitation || mongoose.model<ISheetInvitation>("SheetInvitation", SheetInvitationSchema);
