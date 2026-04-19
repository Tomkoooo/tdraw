import mongoose, { Schema, Document } from "mongoose";

export type TaskBoardColumn = { id: string; title: string; order: number };

export interface ITaskBoard extends Document {
  scope: "personal" | "org";
  userId?: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  columns: TaskBoardColumn[];
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_TASK_COLUMNS: TaskBoardColumn[] = [
  { id: "col_todo", title: "To Do", order: 0 },
  { id: "col_doing", title: "In Progress", order: 1 },
  { id: "col_done", title: "Done", order: 2 },
];

const ColumnSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const TaskBoardSchema = new Schema(
  {
    scope: { type: String, enum: ["personal", "org"], required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", index: true },
    columns: { type: [ColumnSchema], default: () => [...DEFAULT_TASK_COLUMNS] },
  },
  { timestamps: true }
);

TaskBoardSchema.index({ userId: 1 }, { unique: true, sparse: true });
TaskBoardSchema.index({ organizationId: 1 }, { unique: true, sparse: true });

export default mongoose.models.TaskBoard || mongoose.model<ITaskBoard>("TaskBoard", TaskBoardSchema);
