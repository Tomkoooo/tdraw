"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, MessageSquareText, Tag, GripVertical } from "lucide-react";
import {
  createTask,
  moveTaskToColumn,
  updateTaskCard,
  addTaskComment,
  deleteTask,
  addBoardColumn,
} from "@/lib/actions/task";
import { toastActionError } from "@/lib/client/actionFeedback";

export type BoardColumn = { id: string; title: string; order: number };

export type KanbanTask = {
  _id: string;
  title: string;
  columnId: string;
  description: string;
  labels: string[];
  comments: { userId: string; body: string; createdAt: string }[];
  dueAt: string | null;
  assigneeUserId: string | null;
  assignedToAll: boolean;
  createdByUserId: string;
  updatedAt: string;
};

type Member = { userId: string; name: string; email: string };

function DraggableCard({
  task,
  onOpen,
}: {
  task: KanbanTask;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task._id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.35 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="touch-none" {...attributes}>
      <div className="flex rounded-2xl border border-[var(--glass-border)] bg-white/70 shadow-sm dark:bg-black/35">
        <button
          type="button"
          className="touch-none shrink-0 rounded-l-2xl p-3 text-gray-400 hover:bg-black/5 dark:hover:bg-white/10"
          {...listeners}
          aria-label="Drag card"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 p-3 text-left">
          <p className="font-semibold leading-snug text-[var(--color-text)]">{task.title}</p>
          {task.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{task.description}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {task.labels.map((l) => (
              <span
                key={l}
                className="inline-flex items-center gap-0.5 rounded-full bg-[var(--color-accent)]/12 px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--color-accent)]"
              >
                <Tag className="h-3 w-3" />
                {l}
              </span>
            ))}
            {task.dueAt ? (
              <span className="text-[10px] font-medium text-gray-500">Due {new Date(task.dueAt).toLocaleDateString()}</span>
            ) : null}
            {task.comments.length ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                <MessageSquareText className="h-3 w-3" />
                {task.comments.length}
              </span>
            ) : null}
          </div>
        </button>
      </div>
    </div>
  );
}

function ColumnShell({
  column,
  count,
  children,
}: {
  column: BoardColumn;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop-${column.id}` });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[280px] min-w-[260px] flex-1 flex-col rounded-[1.35rem] border border-[var(--input-border)] bg-[var(--input-bg)]/80 p-3 shadow-inner transition-colors md:min-w-[280px] ${
        isOver ? "ring-2 ring-[var(--color-accent)]/50" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold tracking-tight text-[var(--color-text)]">{column.title}</h3>
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-white/10 dark:text-gray-400">
          {count}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto pb-2">{children}</div>
    </div>
  );
}

export default function TasksKanbanBoard({
  scope,
  organizationId,
  organizationName,
  columns,
  tasks,
  members,
  currentUserId,
}: {
  scope: "personal" | "org";
  organizationId?: string;
  organizationName?: string;
  columns: BoardColumn[];
  tasks: KanbanTask[];
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [localTasks, setLocalTasks] = useState(tasks);

  useEffect(() => {
    queueMicrotask(() => setLocalTasks(tasks));
  }, [tasks]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [newColTitle, setNewColTitle] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const tasksByCol = useMemo(() => {
    const m = new Map<string, KanbanTask[]>();
    for (const c of columns) m.set(c.id, []);
    const fallback = columns[0]?.id ?? "col_todo";
    for (const t of localTasks) {
      const key = columns.some((c) => c.id === t.columnId) ? t.columnId : fallback;
      m.get(key)?.push(t);
    }
    for (const arr of m.values()) arr.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return m;
  }, [localTasks, columns]);

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const taskId = String(active.id);
    const overId = String(over.id);
    const destCol = overId.startsWith("drop-") ? overId.slice("drop-".length) : null;
    if (!destCol) return;
    const t = localTasks.find((x) => x._id === taskId);
    if (!t || t.columnId === destCol) return;
    setLocalTasks((prev) => prev.map((x) => (x._id === taskId ? { ...x, columnId: destCol } : x)));
    try {
      await moveTaskToColumn(taskId, destCol);
      router.refresh();
    } catch (e) {
      toastActionError(e, { id: "task-move-column" });
      setLocalTasks(tasks);
    }
  };

  const detail = detailId ? localTasks.find((t) => t._id === detailId) : null;

  return (
    <div className="space-y-6">
      {organizationName ? (
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">{organizationName}</p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New card title…"
          className="min-h-[48px] min-w-[12rem] flex-1 rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm"
        />
        <button
          type="button"
          className="min-h-[48px] rounded-2xl bg-[var(--color-accent)] px-5 text-sm font-semibold text-white"
          onClick={async () => {
            if (!newTitle.trim()) return;
            try {
              await createTask({
                scope,
                organizationId: scope === "org" ? organizationId : undefined,
                title: newTitle,
                columnId: columns[0]?.id,
              });
              setNewTitle("");
              router.refresh();
            } catch (e) {
              toastActionError(e, { id: "task-create" });
            }
          }}
        >
          Add card
        </button>
      </div>

      <div className="glass-panel rounded-[1.5rem] p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Add column</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={newColTitle}
            onChange={(e) => setNewColTitle(e.target.value)}
            placeholder="Column name"
            className="min-h-[44px] flex-1 rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
          />
          <button
            type="button"
            className="rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-2 text-sm font-semibold"
            onClick={async () => {
              if (!newColTitle.trim()) return;
              try {
                await addBoardColumn(scope, organizationId, newColTitle);
                setNewColTitle("");
                router.refresh();
              } catch (e) {
                toastActionError(e, { id: "task-add-column" });
              }
            }}
          >
            Add
          </button>
        </div>
      </div>

      <DndContext
        id="tdraw-tasks-kanban"
        sensors={sensors}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={(ev) => void onDragEnd(ev)}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => {
            const colTasks = tasksByCol.get(col.id) ?? [];
            return (
              <ColumnShell key={col.id} column={col} count={colTasks.length}>
                {colTasks.map((task) => (
                  <DraggableCard key={task._id} task={task} onOpen={() => setDetailId(task._id)} />
                ))}
              </ColumnShell>
            );
          })}
        </div>
        <DragOverlay>
          {activeId ? (
            <div className="rounded-2xl border border-[var(--glass-border)] bg-white/90 px-4 py-3 shadow-xl dark:bg-black/80">
              <p className="font-semibold">{localTasks.find((t) => t._id === activeId)?.title}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {detail ? (
        <TaskDetailDrawer
          task={detail}
          members={members}
          currentUserId={currentUserId}
          scope={scope}
          organizationId={organizationId}
          onClose={() => setDetailId(null)}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

function TaskDetailDrawer({
  task,
  members,
  currentUserId,
  scope,
  organizationId,
  onClose,
  onSaved,
}: {
  task: KanbanTask;
  members: Member[];
  currentUserId: string;
  scope: "personal" | "org";
  /** Reserved for org-scoped rules / future links */
  organizationId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [dueAt, setDueAt] = useState(task.dueAt ? task.dueAt.slice(0, 16) : "");
  const [assignee, setAssignee] = useState(task.assigneeUserId ?? "");
  const [assignAll, setAssignAll] = useState(task.assignedToAll);
  const [labels, setLabels] = useState(task.labels.join(", "));
  const [comment, setComment] = useState("");

  const save = async () => {
    try {
      await updateTaskCard(task._id, {
        title,
        description,
        dueAt: dueAt || null,
        assigneeUserId: scope === "org" && !assignAll && assignee ? assignee : null,
        assignedToAll: scope === "org" ? assignAll : false,
        labels: labels
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      onSaved();
    } catch (e) {
      toastActionError(e, { id: "task-card-save" });
    }
  };

  const sendComment = async () => {
    if (!comment.trim()) return;
    try {
      await addTaskComment(task._id, comment);
      setComment("");
      onSaved();
    } catch (e) {
      toastActionError(e, { id: "task-card-comment" });
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-menu relative flex h-full w-full max-w-md flex-col border-l border-[var(--glass-border)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-4 py-3">
          <div>
            <h2 className="text-lg font-bold">Card</h2>
            {scope === "org" && organizationId ? (
              <p className="mt-0.5 text-[11px] font-medium text-gray-500">Organization board</p>
            ) : null}
          </div>
          <div className="flex gap-2">
            {task.createdByUserId === currentUserId ? (
              <button
                type="button"
                className="rounded-xl p-2 text-red-600 dark:text-red-400"
                aria-label="Delete"
                onClick={() => {
                  if (confirm("Delete this card?")) {
                    void deleteTask(task._id)
                      .then(() => {
                        onClose();
                        onSaved();
                      })
                      .catch((e) => toastActionError(e, { id: "task-card-delete" }));
                  }
                }}
              >
                <Trash2 className="h-5 w-5" />
              </button>
            ) : null}
            <button type="button" className="rounded-xl px-3 py-1.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <label className="block text-xs font-bold uppercase text-gray-500">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold"
          />
          <label className="block text-xs font-bold uppercase text-gray-500">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
          />
          <label className="block text-xs font-bold uppercase text-gray-500">Due</label>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
          />
          <label className="block text-xs font-bold uppercase text-gray-500">Labels (comma-separated)</label>
          <input
            value={labels}
            onChange={(e) => setLabels(e.target.value)}
            className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
          />
          {scope === "org" ? (
            <>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={assignAll} onChange={(e) => setAssignAll(e.target.checked)} />
                Whole organization
              </label>
              {!assignAll ? (
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
              ) : null}
            </>
          ) : null}
          <button type="button" className="w-full rounded-2xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white" onClick={() => void save()}>
            Save changes
          </button>

          <div className="border-t border-[var(--glass-border)] pt-4">
            <h3 className="mb-2 text-xs font-bold uppercase text-gray-500">Comments</h3>
            <ul className="mb-3 max-h-40 space-y-2 overflow-y-auto text-sm">
              {task.comments.map((c, i) => (
                <li key={i} className="rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2">
                  <p className="text-[11px] font-semibold text-gray-500">{c.userId === currentUserId ? "You" : "Member"}</p>
                  <p>{c.body}</p>
                </li>
              ))}
            </ul>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Write a comment…"
              rows={3}
              className="mb-2 w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              className="w-full rounded-2xl border border-[var(--input-border)] py-2 text-sm font-semibold"
              onClick={() => void sendComment()}
            >
              Post comment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
