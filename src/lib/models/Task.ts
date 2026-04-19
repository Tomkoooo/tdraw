import mongoose, { Schema, Document } from "mongoose";

export type TaskScope = "personal" | "org";
export type TaskStatus = "open" | "done" | "cancelled";

export type TaskComment = {
  userId: mongoose.Types.ObjectId;
  body: string;
  createdAt: Date;
};

export interface ITask extends Document {
  scope: TaskScope;
  organizationId?: mongoose.Types.ObjectId;
  title: string;
  /** Legacy status; Kanban uses `columnId`. */
  status: TaskStatus;
  /** Kanban column id (matches TaskBoard.columns[].id). */
  columnId: string;
  description?: string;
  labels: string[];
  comments: TaskComment[];
  /** null = unassigned personal; for org, use assignedToAll */
  assigneeUserId?: mongoose.Types.ObjectId;
  assignedToAll: boolean;
  dueAt?: Date;
  createdByUserId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const TaskSchema = new Schema(
  {
    scope: { type: String, enum: ["personal", "org"], required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", index: true },
    title: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, enum: ["open", "done", "cancelled"], default: "open" },
    columnId: { type: String, default: "col_todo", index: true },
    description: { type: String, maxlength: 8000 },
    labels: { type: [String], default: [] },
    comments: { type: [CommentSchema], default: [] },
    assigneeUserId: { type: Schema.Types.ObjectId, ref: "User" },
    assignedToAll: { type: Boolean, default: false },
    dueAt: { type: Date },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

TaskSchema.index({ scope: 1, createdByUserId: 1, updatedAt: -1 });
TaskSchema.index({ organizationId: 1, updatedAt: -1 });

export default mongoose.models.Task || mongoose.model<ITask>("Task", TaskSchema);
