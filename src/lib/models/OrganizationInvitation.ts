import mongoose, { Schema, Document } from "mongoose";
import type { OrgMemberRole } from "./Organization";

export interface IOrganizationInvitation extends Document {
  organizationId: mongoose.Types.ObjectId;
  email: string;
  role: OrgMemberRole;
  tokenHash: string;
  expiresAt: Date;
  invitedByUserId: mongoose.Types.ObjectId;
  acceptedAt?: Date;
  acceptedByUserId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationInvitationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: { type: String, enum: ["admin", "member", "guest"], default: "member" },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
    invitedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    acceptedAt: { type: Date },
    acceptedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.models.OrganizationInvitation ||
  mongoose.model<IOrganizationInvitation>("OrganizationInvitation", OrganizationInvitationSchema);
