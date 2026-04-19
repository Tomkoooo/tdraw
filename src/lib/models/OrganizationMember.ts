import mongoose, { Schema, Document } from "mongoose";
import type { OrgMemberRole } from "./Organization";

export interface IOrganizationMember extends Document {
  organizationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: OrgMemberRole;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationMemberSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["admin", "member", "guest"], required: true, default: "member" },
  },
  { timestamps: true }
);

OrganizationMemberSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export default mongoose.models.OrganizationMember ||
  mongoose.model<IOrganizationMember>("OrganizationMember", OrganizationMemberSchema);
