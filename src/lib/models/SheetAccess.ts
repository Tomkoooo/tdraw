import mongoose, { Schema, Document } from "mongoose";
import type { OrgMemberRole } from "./Organization";
import type { FolderPermissionLevel } from "./FolderAccess";

export interface ISheetAccess extends Document {
  sheetId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  role?: OrgMemberRole;
  level: FolderPermissionLevel;
  createdAt: Date;
  updatedAt: Date;
}

const SheetAccessSchema = new Schema(
  {
    sheetId: { type: Schema.Types.ObjectId, ref: "Sheet", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    role: { type: String, enum: ["admin", "member", "guest"], index: true },
    level: { type: String, enum: ["hidden", "view", "read_only", "full"], required: true },
  },
  { timestamps: true }
);

SheetAccessSchema.index(
  { sheetId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { userId: { $exists: true, $ne: null } },
  },
);
SheetAccessSchema.index(
  { sheetId: 1, role: 1 },
  {
    unique: true,
    partialFilterExpression: { role: { $exists: true, $ne: null } },
  },
);

export default mongoose.models.SheetAccess || mongoose.model<ISheetAccess>("SheetAccess", SheetAccessSchema);
