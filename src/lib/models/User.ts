import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  name: string;
  image?: string;
  providerId: string;
  /** Tldraw tool ids to show on the bottom hotbar (subset/order). Empty = all defaults. */
  hotbarToolIds: string[];
  /** Personal drive quota in bytes (default 5 GiB if unset). */
  storageQuotaBytes?: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    image: { type: String },
    providerId: { type: String, required: true, unique: true },
    hotbarToolIds: { type: [String], default: [] },
    storageQuotaBytes: { type: Number },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
