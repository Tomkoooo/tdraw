"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, FolderOpen, Home, Plus, Search } from "lucide-react";
import { listFolders, createFolder, moveFolder as moveFolderToParent } from "@/lib/actions/folder";
import { moveSheetToFolder } from "@/lib/actions/sheet";
import { toastActionError } from "@/lib/client/actionFeedback";
import { toast } from "sonner";

const RECENT_KEY = "tdraw:move-to-recent-folders";

type Row = { _id: string; name: string; parentFolderId: string | null };

function buildChildrenMap(rows: Row[]) {
  const byParent = new Map<string | null, Row[]>();
  for (const r of rows) {
    const p = r.parentFolderId ?? null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(r);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return byParent;
}

function readRecent(): string[] {
  try {
    if (typeof window === "undefined") return [];
    const r = localStorage.getItem(RECENT_KEY);
    if (!r) return [];
    const a = JSON.parse(r) as unknown;
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeRecent(id: string) {
  const cur = readRecent().filter((x) => x !== id);
  cur.unshift(id);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 8)));
  } catch {
    /* ignore */
  }
}

function FolderRow({
  row,
  depth,
  byParent,
  expanded,
  onToggle,
  onPick,
  currentFolderId,
  moveBusy,
  q,
}: {
  row: Row;
  depth: number;
  byParent: Map<string | null, Row[]>;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onPick: (id: string | null) => void;
  currentFolderId?: string | null;
  moveBusy: boolean;
  q: string;
}) {
  if (q.trim() && !row.name.toLowerCase().includes(q.trim().toLowerCase())) return null;
  const children = byParent.get(row._id) ?? [];
  const hasCh = children.length > 0;
  const isOpen = expanded.has(row._id);
  return (
    <div style={{ marginLeft: depth * 8 }}>
      <div
        className={`flex w-full min-w-0 items-stretch rounded-xl ${
          currentFolderId === row._id ? "bg-[var(--color-accent)]/8 ring-1 ring-[var(--color-accent)]" : ""
        }`}
      >
        <button
          type="button"
          className="p-1.5 text-gray-500 hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => onToggle(row._id)}
        >
          {hasCh ? <ChevronRight className={`h-4 w-4 ${isOpen ? "rotate-90" : ""} transition`} /> : <span className="inline-block w-4" />}
        </button>
        <button
          type="button"
          disabled={moveBusy}
          onClick={() => onPick(row._id)}
          className="min-w-0 flex-1 rounded-r-xl py-2 pr-2 text-left text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <FolderOpen className="h-4 w-4 shrink-0 opacity-70" />
            <span className="truncate">{row.name}</span>
          </span>
        </button>
      </div>
      {hasCh && isOpen
        ? children.map((c) => (
            <FolderRow
              key={c._id}
              row={c}
              depth={depth + 1}
              byParent={byParent}
              expanded={expanded}
              onToggle={onToggle}
              onPick={onPick}
              currentFolderId={currentFolderId}
              moveBusy={moveBusy}
              q={q}
            />
          ))
        : null}
    </div>
  );
}

export default function MoveToSheet({
  open,
  onClose,
  onDone,
  title,
  mode,
  organizationId,
  currentFolderId,
  itemKind = "sheet",
  movingSheetIds,
  movingFolderId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  title: string;
  mode: "personal" | "org";
  organizationId: string | null;
  currentFolderId?: string | null;
  itemKind?: "sheet" | "folder";
  movingSheetIds: string[] | null;
  movingFolderId: string | null;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [moveBusy, setMoveBusy] = useState(false);

  const byParent = useMemo(() => buildChildrenMap(rows), [rows]);
  const rootRows = byParent.get(null) ?? [];
  const recent = useMemo(
    () => readRecent().map((id) => rows.find((r) => r._id === id)).filter((x): x is Row => !!x),
    [rows]
  );

  const searchHits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return null;
    return rows.filter((r) => r.name.toLowerCase().includes(t));
  }, [q, rows]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const f =
        mode === "org" && organizationId
          ? await listFolders({ organizationId })
          : await listFolders({ ownerPersonal: true });
      setRows(f.map((x) => ({ _id: x._id, name: x.name, parentFolderId: x.parentFolderId })));
    } catch (e) {
      toastActionError(e, { id: "move-to-load" });
    } finally {
      setLoading(false);
    }
  }, [mode, organizationId]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setNewName("");
      return;
    }
    void load();
  }, [open, load]);

  const onPick = async (folderId: string | null) => {
    if (itemKind === "sheet" && (!movingSheetIds || movingSheetIds.length === 0)) return;
    if (itemKind === "folder" && !movingFolderId) return;
    if (moveBusy) return;
    setMoveBusy(true);
    const fromFolder = currentFolderId ?? null;
    try {
      if (itemKind === "sheet") {
        for (const sid of movingSheetIds ?? []) {
          await moveSheetToFolder(sid, folderId);
        }
        if (folderId) writeRecent(folderId);
        onDone();
        onClose();
        const name =
          folderId == null
            ? mode === "org"
              ? "org root"
              : "My Drive"
            : rows.find((r) => r._id === folderId)?.name ?? "folder";
        toast(`Moved to ${name}`, {
          action: {
            label: "Undo",
            onClick: () => {
              for (const sid of movingSheetIds ?? []) {
                void moveSheetToFolder(sid, fromFolder)
                  .then(() => onDone())
                  .catch((e) => toastActionError(e, { id: "move-undo" }));
              }
            },
          },
          duration: 6000,
        });
        return;
      }
      if (itemKind === "folder" && movingFolderId) {
        await moveFolderToParent(movingFolderId, folderId);
        onDone();
        onClose();
        toast("Folder moved", { duration: 4000 });
        return;
      }
    } catch (e) {
      toastActionError(e, { id: "move-to-exec" });
    } finally {
      setMoveBusy(false);
    }
  };

  const onToggle = (id: string) => {
    setExpanded((e) => {
      const n = new Set(e);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  if (!open || typeof document === "undefined") return null;

  const rootLabel = mode === "org" ? "Org root (no folder)" : "My Drive (no folder)";

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-menu relative z-10 flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl p-0 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-white/10 px-5 py-4 dark:border-white/5">
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        </div>
        <div className="p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
            <input
              className="input-field min-h-11 w-full rounded-2xl py-2.5 pl-10 pr-3 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search folders"
            />
          </div>
        </div>
        {searchHits == null && !q.trim() && recent.length > 0 ? (
          <div className="px-4 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Recent</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {recent.map((r) => (
                <button
                  key={r._id}
                  type="button"
                  disabled={moveBusy}
                  onClick={() => void onPick(r._id)}
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--color-accent)]/12 px-2.5 py-1 text-xs font-semibold text-[var(--color-accent)]"
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-1">
          {loading ? <p className="py-8 text-center text-sm text-gray-500">Loading…</p> : null}
          <button
            type="button"
            disabled={moveBusy}
            onClick={() => void onPick(null)}
            className="mb-2 flex w-full min-h-12 items-center gap-2 rounded-2xl bg-black/[0.04] px-3 py-2.5 text-left text-sm font-semibold hover:bg-black/8 dark:bg-white/8 dark:hover:bg-white/12"
          >
            <Home className="h-4 w-4" />
            {rootLabel}
          </button>
          {searchHits != null
            ? searchHits.map((r) => (
                <button
                  key={r._id}
                  type="button"
                  disabled={moveBusy}
                  onClick={() => void onPick(r._id)}
                  className="mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <FolderOpen className="h-4 w-4 opacity-60" />
                  {r.name}
                </button>
              ))
            : rootRows.map((r) => (
                <FolderRow
                  key={r._id}
                  row={r}
                  depth={0}
                  byParent={byParent}
                  expanded={expanded}
                  onToggle={onToggle}
                  onPick={onPick}
                  currentFolderId={currentFolderId}
                  moveBusy={moveBusy}
                  q={q}
                />
              ))}
        </div>
        <div className="border-t border-white/10 p-4 dark:border-white/5">
          <p className="text-[10px] font-bold uppercase text-gray-500">New folder in root</p>
          <div className="mt-1 flex gap-2">
            <input
              className="input-field min-h-10 flex-1 rounded-xl px-3 text-sm"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              type="button"
              className="flex shrink-0 items-center gap-1 rounded-xl bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={creating || !newName.trim() || (mode === "org" && !organizationId)}
              onClick={async () => {
                if (!newName.trim()) return;
                setCreating(true);
                try {
                  if (mode === "org" && organizationId) {
                    await createFolder({ name: newName, organizationId });
                  } else {
                    await createFolder({ name: newName, personal: true });
                  }
                  setNewName("");
                  await load();
                } catch (e) {
                  toastActionError(e, { id: "move-to-new-folder" });
                } finally {
                  setCreating(false);
                }
              }}
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-3">
          <button
            type="button"
            className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
            disabled={moveBusy}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
