"use server";

import { auth } from "@/auth";
import dbConnect from "@/lib/db/mongoose";
import mongoose from "mongoose";
import Task from "@/lib/models/Task";
import TaskBoard, { DEFAULT_TASK_COLUMNS, type TaskBoardColumn } from "@/lib/models/TaskBoard";
import { requireOrgMember } from "@/lib/authz/org";
import { revalidatePath } from "next/cache";

const COL_DONE = "col_done";
const COL_TODO = "col_todo";

function inferColumnId(t: { columnId?: string | null; status?: string }): string {
  if (t.columnId && typeof t.columnId === "string") return t.columnId;
  if (t.status === "done" || t.status === "cancelled") return COL_DONE;
  return COL_TODO;
}

async function ensurePersonalBoard(userId: string) {
  let b = await TaskBoard.findOne({ scope: "personal", userId: new mongoose.Types.ObjectId(userId) }).lean();
  if (!b) {
    try {
      const doc = await TaskBoard.create({
        scope: "personal",
        userId: new mongoose.Types.ObjectId(userId),
        columns: DEFAULT_TASK_COLUMNS.map((c) => ({ ...c })),
      });
      b = doc.toObject();
    } catch {
      b = await TaskBoard.findOne({ scope: "personal", userId: new mongoose.Types.ObjectId(userId) }).lean();
    }
  }
  if (!b) throw new Error("Board unavailable");
  return b;
}

async function ensureOrgBoard(organizationId: string, sessionUserId: string) {
  await requireOrgMember(sessionUserId, organizationId);
  let b = await TaskBoard.findOne({
    scope: "org",
    organizationId: new mongoose.Types.ObjectId(organizationId),
  }).lean();
  if (!b) {
    try {
      const doc = await TaskBoard.create({
        scope: "org",
        organizationId: new mongoose.Types.ObjectId(organizationId),
        columns: DEFAULT_TASK_COLUMNS.map((c) => ({ ...c })),
      });
      b = doc.toObject();
    } catch {
      b = await TaskBoard.findOne({
        scope: "org",
        organizationId: new mongoose.Types.ObjectId(organizationId),
      }).lean();
    }
  }
  if (!b) throw new Error("Board unavailable");
  return b;
}

function columnIds(board: { columns?: TaskBoardColumn[] }): Set<string> {
  return new Set((board.columns ?? []).map((c) => c.id));
}

function mapTaskRow(t: {
  _id: unknown;
  title?: string;
  status?: string;
  columnId?: string | null;
  description?: string;
  labels?: string[];
  comments?: { userId: unknown; body: string; createdAt?: Date }[];
  dueAt?: Date;
  assigneeUserId?: unknown;
  assignedToAll?: boolean;
  createdByUserId?: unknown;
  updatedAt?: Date;
}) {
  const columnId = inferColumnId(t);
  return {
    _id: String(t._id),
    title: t.title ?? "",
    status: t.status ?? "open",
    columnId,
    description: t.description ?? "",
    labels: (t.labels ?? []).slice(0, 20),
    comments: (t.comments ?? []).map((c) => ({
      userId: String(c.userId),
      body: c.body,
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
    })),
    dueAt: t.dueAt ? new Date(t.dueAt).toISOString() : null,
    assigneeUserId: t.assigneeUserId ? String(t.assigneeUserId) : null,
    assignedToAll: !!t.assignedToAll,
    createdByUserId: String(t.createdByUserId),
    updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export async function getTaskBoardData(scope: "personal" | "org", organizationId?: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const boardLean =
    scope === "personal"
      ? await ensurePersonalBoard(session.user.id)
      : await ensureOrgBoard(organizationId!, session.user.id);

  const boardId = String(boardLean._id);
  const cols = columnIds(boardLean);

  const q: Record<string, unknown> =
    scope === "personal"
      ? { scope: "personal", createdByUserId: new mongoose.Types.ObjectId(session.user.id) }
      : {
          scope: "org",
          organizationId: new mongoose.Types.ObjectId(organizationId),
        };

  const raw = await Task.find(q).sort({ updatedAt: -1 }).lean();
  const tasks = raw.map(mapTaskRow);

  const invalid = raw.filter((t) => {
    const cid = inferColumnId(t);
    return !cols.has(cid);
  });
  if (invalid.length) {
    await Task.updateMany(
      { _id: { $in: invalid.map((t) => t._id) } },
      { $set: { columnId: COL_TODO } }
    );
    for (const t of tasks) {
      if (!cols.has(t.columnId)) t.columnId = COL_TODO;
    }
  }

  const boardCols = (boardLean.columns ?? DEFAULT_TASK_COLUMNS) as TaskBoardColumn[];
  return {
    boardId,
    columns: boardCols.slice().sort((a: TaskBoardColumn, b: TaskBoardColumn) => a.order - b.order),
    tasks,
  };
}

export async function createTask(input: {
  scope: "personal" | "org";
  organizationId?: string;
  title: string;
  columnId?: string;
  description?: string;
  labels?: string[];
  dueAt?: string | null;
  assigneeUserId?: string | null;
  assignedToAll?: boolean;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  if (input.scope === "org") {
    if (!input.organizationId) throw new Error("Missing org");
    await requireOrgMember(session.user.id, input.organizationId);
    await ensureOrgBoard(input.organizationId, session.user.id);
  } else {
    await ensurePersonalBoard(session.user.id);
  }

  const board =
    input.scope === "personal"
      ? await ensurePersonalBoard(session.user.id)
      : await ensureOrgBoard(input.organizationId!, session.user.id);
  const allowed = columnIds(board);
  const columnId = input.columnId && allowed.has(input.columnId) ? input.columnId : COL_TODO;

  await Task.create({
    scope: input.scope,
    organizationId: input.organizationId ? new mongoose.Types.ObjectId(input.organizationId) : undefined,
    title: input.title.trim().slice(0, 500),
    columnId,
    description: input.description?.trim().slice(0, 8000),
    labels: (input.labels ?? []).map((l) => l.trim().slice(0, 40)).filter(Boolean).slice(0, 12),
    dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
    assigneeUserId: input.assigneeUserId ? new mongoose.Types.ObjectId(input.assigneeUserId) : undefined,
    assignedToAll: !!input.assignedToAll,
    createdByUserId: new mongoose.Types.ObjectId(session.user.id),
    status: columnId === COL_DONE ? "done" : "open",
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
}

export async function moveTaskToColumn(taskId: string, columnId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const task = await Task.findById(taskId).lean();
  if (!task) throw new Error("Not found");

  if (task.scope === "personal") {
    if (String(task.createdByUserId) !== session.user.id && String(task.assigneeUserId) !== session.user.id) {
      throw new Error("Forbidden");
    }
    const board = await ensurePersonalBoard(session.user.id);
    if (!columnIds(board).has(columnId)) throw new Error("Invalid column");
  } else {
    if (!task.organizationId) throw new Error("Invalid");
    await requireOrgMember(session.user.id, String(task.organizationId));
    const board = await ensureOrgBoard(String(task.organizationId), session.user.id);
    if (!columnIds(board).has(columnId)) throw new Error("Invalid column");
  }

  const status = columnId === COL_DONE ? "done" : "open";
  await Task.updateOne({ _id: taskId }, { $set: { columnId, status } });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
}

export async function updateTaskCard(
  taskId: string,
  input: {
    title?: string;
    description?: string;
    dueAt?: string | null;
    assigneeUserId?: string | null;
    assignedToAll?: boolean;
    labels?: string[];
  }
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const task = await Task.findById(taskId).lean();
  if (!task) throw new Error("Not found");

  if (task.scope === "personal") {
    if (String(task.createdByUserId) !== session.user.id && String(task.assigneeUserId) !== session.user.id) {
      throw new Error("Forbidden");
    }
  } else {
    if (!task.organizationId) throw new Error("Invalid");
    await requireOrgMember(session.user.id, String(task.organizationId));
  }

  const $set: Record<string, unknown> = {};
  if (input.title !== undefined) $set.title = input.title.trim().slice(0, 500);
  if (input.description !== undefined) $set.description = input.description?.trim().slice(0, 8000) ?? "";
  if (input.dueAt !== undefined) $set.dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (input.assigneeUserId !== undefined) {
    $set.assigneeUserId = input.assigneeUserId ? new mongoose.Types.ObjectId(input.assigneeUserId) : null;
  }
  if (input.assignedToAll !== undefined) $set.assignedToAll = input.assignedToAll;
  if (input.labels !== undefined) {
    $set.labels = input.labels.map((l) => l.trim().slice(0, 40)).filter(Boolean).slice(0, 12);
  }

  await Task.updateOne({ _id: taskId }, { $set });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
}

export async function addTaskComment(taskId: string, body: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const trimmed = body.trim().slice(0, 4000);
  if (!trimmed) throw new Error("Empty comment");

  await dbConnect();
  const task = await Task.findById(taskId).lean();
  if (!task) throw new Error("Not found");

  if (task.scope === "personal") {
    if (String(task.createdByUserId) !== session.user.id && String(task.assigneeUserId) !== session.user.id) {
      throw new Error("Forbidden");
    }
  } else {
    if (!task.organizationId) throw new Error("Invalid");
    await requireOrgMember(session.user.id, String(task.organizationId));
  }

  await Task.updateOne(
    { _id: taskId },
    {
      $push: {
        comments: {
          userId: new mongoose.Types.ObjectId(session.user.id),
          body: trimmed,
          createdAt: new Date(),
        },
      },
    }
  );
  revalidatePath("/dashboard/tasks");
}

export async function addBoardColumn(scope: "personal" | "org", organizationId: string | undefined, title: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  const name = title.trim().slice(0, 80) || "New list";
  const id = `col_${new mongoose.Types.ObjectId().toString()}`;

  const board =
    scope === "personal"
      ? await ensurePersonalBoard(session.user.id)
      : await ensureOrgBoard(organizationId!, session.user.id);

  const cols = (board.columns ?? []) as TaskBoardColumn[];
  const nextOrder = Math.max(0, ...cols.map((c: TaskBoardColumn) => c.order)) + 1;
  await TaskBoard.updateOne(
    { _id: board._id },
    { $push: { columns: { id, title: name, order: nextOrder } } }
  );
  revalidatePath("/dashboard/tasks");
}

export async function reorderBoardColumns(scope: "personal" | "org", organizationId: string | undefined, orderedIds: string[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const board =
    scope === "personal"
      ? await ensurePersonalBoard(session.user.id)
      : await ensureOrgBoard(organizationId!, session.user.id);

  const boardCols = (board.columns ?? []) as TaskBoardColumn[];
  const byId = new Map(boardCols.map((c: TaskBoardColumn) => [c.id, c] as const));
  const next: TaskBoardColumn[] = orderedIds
    .map((id: string, i: number) => {
      const c = byId.get(id);
      if (!c) return null;
      return { ...c, order: i };
    })
    .filter(Boolean) as TaskBoardColumn[];

  const missing = boardCols.filter((c: TaskBoardColumn) => !orderedIds.includes(c.id));
  const merged = [...next, ...missing.map((c: TaskBoardColumn, i: number) => ({ ...c, order: next.length + i }))];

  await TaskBoard.updateOne({ _id: board._id }, { $set: { columns: merged } });
  revalidatePath("/dashboard/tasks");
}

export async function deleteTask(taskId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const task = await Task.findById(taskId).lean();
  if (!task) throw new Error("Not found");

  if (task.scope === "personal") {
    if (String(task.createdByUserId) !== session.user.id) throw new Error("Forbidden");
  } else {
    if (!task.organizationId) throw new Error("Invalid");
    await requireOrgMember(session.user.id, String(task.organizationId));
    if (String(task.createdByUserId) !== session.user.id) throw new Error("Only creator can delete");
  }

  await Task.deleteOne({ _id: taskId });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
}

/** @deprecated Kanban uses columns; kept for older callers */
export async function listTasks(scope: "personal" | "org", organizationId?: string) {
  const { tasks } = await getTaskBoardData(scope, organizationId);
  return tasks.map((t) => ({
    _id: t._id,
    title: t.title,
    status: t.status,
    dueAt: t.dueAt,
    assigneeUserId: t.assigneeUserId,
    assignedToAll: t.assignedToAll,
    createdByUserId: t.createdByUserId,
  }));
}

export async function updateTaskStatus(taskId: string, status: "open" | "done" | "cancelled") {
  const col = status === "done" || status === "cancelled" ? COL_DONE : COL_TODO;
  await moveTaskToColumn(taskId, col);
}
