"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

type TaskRow = {
  _id: string;
  title: string;
  status: string;
  dueAt: string | null;
  assigneeUserId: string | null;
  assignedToAll: boolean;
  createdByUserId?: string;
};

type Member = { userId: string; name: string; email: string };

export default function TasksClient({
  personal,
  orgBlocks,
  orgs,
  orgMembersByOrg,
  currentUserId,
  createTask,
  updateTaskStatus,
  deleteTask,
}: {
  personal: TaskRow[];
  orgBlocks: { orgId: string; orgName: string; tasks: TaskRow[] }[];
  orgs: { _id: string; name: string }[];
  orgMembersByOrg: Record<string, Member[]>;
  currentUserId: string;
  createTask: (input: {
    scope: "personal" | "org";
    organizationId?: string;
    title: string;
    dueAt?: string | null;
    assigneeUserId?: string | null;
    assignedToAll?: boolean;
  }) => Promise<void>;
  updateTaskStatus: (id: string, s: "open" | "done" | "cancelled") => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [scope, setScope] = useState<"personal" | "org">("personal");
  const [orgId, setOrgId] = useState(orgs[0]?._id ?? "");
  const [assignAll, setAssignAll] = useState(false);
  const [assigneeUserId, setAssigneeUserId] = useState<string>("");

  const members = orgId ? orgMembersByOrg[orgId] ?? [] : [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await createTask({
      scope,
      organizationId: scope === "org" ? orgId : undefined,
      title,
      dueAt: dueAt || null,
      assignedToAll: scope === "org" ? assignAll : false,
      assigneeUserId:
        scope === "org" && !assignAll && assigneeUserId
          ? assigneeUserId
          : scope === "personal" && assigneeUserId === "__self"
            ? currentUserId
            : null,
    });
    setTitle("");
    setDueAt("");
    router.refresh();
  };

  const block = (label: string, tasks: TaskRow[]) => (
    <section key={label} className="glass-thick mt-6 rounded-[1.5rem] p-5">
      <h2 className="mb-3 text-base font-semibold">{label}</h2>
      <ul className="space-y-2">
        {tasks.length === 0 ? <li className="text-sm text-gray-500">No tasks.</li> : null}
        {tasks.map((t) => (
          <li
            key={t._id}
            className="flex min-h-[52px] flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <span className={t.status === "done" ? "line-through opacity-60" : ""}>{t.title}</span>
              {t.assignedToAll ? (
                <p className="text-[11px] font-medium text-[var(--color-accent)]">Whole organization</p>
              ) : t.assigneeUserId ? (
                <p className="text-[11px] text-gray-500">Assigned · {t.assigneeUserId === currentUserId ? "You" : t.assigneeUserId}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs font-semibold text-green-700 dark:text-green-400"
                onClick={() => void updateTaskStatus(t._id, "done")}
              >
                Done
              </button>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs text-gray-600 dark:text-gray-400"
                onClick={() => void updateTaskStatus(t._id, "open")}
              >
                Open
              </button>
              {t.createdByUserId === currentUserId ? (
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-red-600 dark:text-red-400"
                  aria-label="Delete task"
                  onClick={() => {
                    if (confirm("Delete this task?")) void deleteTask(t._id).then(() => router.refresh());
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <>
      <form onSubmit={(e) => void submit(e)} className="glass-thick mt-6 flex flex-col gap-4 rounded-[1.5rem] p-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New task…"
          className="input-field min-h-[48px] px-4 text-sm"
        />
        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          Due (optional)
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="input-field mt-1 min-h-[48px] w-full px-3 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-1 rounded-[1.25rem] bg-black/[0.04] p-1 dark:bg-white/[0.06]">
          <button
            type="button"
            onClick={() => setScope("personal")}
            className={`min-h-[44px] flex-1 rounded-[1rem] text-sm font-semibold ${
              scope === "personal" ? "glass-panel shadow-sm" : "text-gray-500 dark:text-gray-400"
            }`}
          >
            Personal
          </button>
          <button
            type="button"
            onClick={() => setScope("org")}
            disabled={!orgs.length}
            className={`min-h-[44px] flex-1 rounded-[1rem] text-sm font-semibold disabled:opacity-40 ${
              scope === "org" ? "glass-panel shadow-sm" : "text-gray-500 dark:text-gray-400"
            }`}
          >
            Organization
          </button>
        </div>
        {scope === "org" ? (
          <select
            value={orgId}
            onChange={(e) => {
              setOrgId(e.target.value);
              setAssigneeUserId("");
            }}
            className="input-field min-h-[48px] rounded-2xl px-4 text-sm font-semibold"
          >
            {orgs.map((o) => (
              <option key={o._id} value={o._id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : null}
        {scope === "org" ? (
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={assignAll}
              onChange={(e) => {
                setAssignAll(e.target.checked);
                if (e.target.checked) setAssigneeUserId("");
              }}
            className="h-4 w-4 rounded border-[var(--input-border)]"
            />
            Whole organization
          </label>
        ) : (
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={assigneeUserId === "__self"}
              onChange={(e) => setAssigneeUserId(e.target.checked ? "__self" : "")}
            className="h-4 w-4 rounded border-[var(--input-border)]"
            />
            Assign to me
          </label>
        )}
        {scope === "org" && !assignAll ? (
          <select
            value={assigneeUserId}
            onChange={(e) => setAssigneeUserId(e.target.value)}
            className="input-field min-h-[48px] rounded-2xl px-4 text-sm"
          >
            <option value="">No specific assignee</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name || m.email}
              </option>
            ))}
          </select>
        ) : null}
        <button type="submit" className="min-h-[50px] rounded-2xl bg-[var(--color-accent)] text-sm font-semibold text-white">
          Add task
        </button>
      </form>
      {block("Personal", personal)}
      {orgBlocks.map((b) => block(b.orgName, b.tasks))}
    </>
  );
}
