import mongoose, { Schema, Document } from "mongoose";

export type OrgMemberRole = "admin" | "member" | "guest";

export interface IOrganization extends Document {
  name: string;
  createdByUserId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.models.Organization || mongoose.model<IOrganization>("Organization", OrganizationSchema);
