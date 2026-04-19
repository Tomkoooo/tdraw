import mongoose, { Schema, Document } from "mongoose";

export interface ISheet extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  canvasState: any; // Storing the raw tldraw snapshot
  previewImage?: string; // Optional base64 or URL for dashboard thumbnail
  createdAt: Date;
  updatedAt: Date;
}

const SheetSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, default: "Untitled Note" },
    canvasState: { type: Schema.Types.Mixed, default: {} },
    previewImage: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.Sheet || mongoose.model<ISheet>("Sheet", SheetSchema);
