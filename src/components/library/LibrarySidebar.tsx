"use client";

import { useDroppable } from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { Building2, ChevronRight, Folder, Home, Share2, Trash2 } from "lucide-react";
import { childrenMap, toRows } from "./treeUtil";
import { dndIdDropFolder, DND_ROOT_PERSONAL } from "./types";
import type { FolderTreeEntry, LibraryNode, OrgRow, SharedSub } from "./types";

function DropRootPill({ dndId, label, show }: { dndId: string; label: string; show: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: dndId, data: { type: "dropRoot" } as const });
  if (!show) return null;
  return (
    <div
      ref={setNodeRef}
      className={`mb-1 rounded-2xl px-2.5 py-1 text-left text-[10px] font-bold ${
        isOver ? "ring-2 ring-[var(--color-accent)]" : "bg-black/[0.04] text-gray-600 dark:bg-white/5 dark:text-gray-300"
      }`}
    >
      {label}
    </div>
  );
}

function DroppableFolderItem({
  id,
  name,
  depth,
  onOpen,
}: {
  id: string;
  name: string;
  depth: number;
  onOpen: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dndIdDropFolder(id), data: { type: "dropFolder", id } as const });
  return (
    <div ref={setNodeRef} style={{ paddingLeft: 6 + depth * 10 }} className={`w-full min-w-0 ${isOver ? "rounded-md bg-[var(--color-accent)]/15" : ""}`}>
      <button type="button" onClick={onOpen} className="inline-flex w-full min-h-7 items-center gap-1 text-left text-xs font-medium hover:text-[var(--color-accent)]">
        <Folder className="h-3.5 w-3.5 shrink-0 opacity-60" />
        <span className="min-w-0 truncate">{name}</span>
      </button>
    </div>
  );
}

function FolderTreeList({
  map,
  parent,
  depth,
  onOpen,
  expanded,
  onExpand,
}: {
  map: ReturnType<typeof childrenMap>;
  parent: string | null;
  depth: number;
  onOpen: (id: string) => void;
  expanded: Set<string>;
  onExpand: (id: string) => void;
}) {
  const ch = map.get(parent) ?? [];
  return ch.map((row) => {
    const sub = map.get(row._id) ?? [];
    const has = sub.length > 0;
    const ex = expanded.has(row._id);
    return (
      <div key={row._id} className="w-full">
        <div className="flex min-w-0 items-start gap-0" style={{ paddingLeft: depth * 6 }}>
          {has ? (
            <button type="button" className="p-0.5 text-gray-500" onClick={() => onExpand(row._id)} aria-label="Toggle">
              <ChevronRight className={`h-3.5 w-3.5 ${ex ? "rotate-90" : ""}`} />
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <DroppableFolderItem id={row._id} name={row.name} depth={depth} onOpen={() => onOpen(row._id)} />
            {has && ex ? <FolderTreeList map={map} parent={row._id} depth={depth + 1} onOpen={onOpen} expanded={expanded} onExpand={onExpand} /> : null}
          </div>
        </div>
      </div>
    );
  });
}

export default function LibrarySidebar({
  node,
  orgId,
  shared,
  onPickNode,
  onSetShared,
  onOpenFolder,
  personalTree,
  orgs,
  dndMode,
  showRootDrop,
  orgDndId,
  orgDndLabel,
  onSelectOrg,
}: {
  node: LibraryNode;
  orgId: string | null;
  shared: SharedSub;
  onPickNode: (n: LibraryNode) => void;
  onSetShared: (s: SharedSub) => void;
  onOpenFolder: (id: string | null, context: "drive" | "org") => void;
  personalTree: FolderTreeEntry[];
  orgs: OrgRow[];
  dndMode: "personal" | "org" | "none";
  showRootDrop: boolean;
  orgDndId: string | null;
  orgDndLabel: string;
  onSelectOrg: (orgId: string) => void;
}) {
  const [ex, setEx] = useState<Set<string>>(() => new Set());
  const expand = (id: string) => {
    setEx((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const pMap = useMemo(() => childrenMap(toRows(personalTree)), [personalTree]);

  return (
    <aside
      className="max-md:hidden md:flex md:w-[15.5rem] md:flex-none md:flex-col md:shrink-0 lg:w-64 md:border-r md:border-white/10 md:bg-black/[0.02] md:py-4 md:pl-4 md:pr-3 dark:md:bg-white/[0.03]"
      aria-label="Library sidebar"
    >
      <div className="mb-2 text-[9px] font-bold uppercase tracking-widest text-gray-500 md:pl-0.5">Navigate</div>
      <button
        type="button"
        onClick={() => onPickNode("home")}
        className={`min-h-10 w-full rounded-2xl px-2 text-left text-sm font-semibold ${
          node === "home" ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]" : "hover:bg-black/5 dark:hover:bg-white/5"
        }`}
      >
        <span className="inline-flex items-center gap-1.5">
          <Home className="h-3.5 w-3.5" />
          Home
        </span>
      </button>
      <div className="mt-4 text-[9px] font-bold uppercase text-gray-500 md:pl-0.5">My Drive</div>
      <DropRootPill show={dndMode === "personal" && showRootDrop} dndId={DND_ROOT_PERSONAL} label="Drop = move to root" />
      <button
        type="button"
        onClick={() => onOpenFolder(null, "drive")}
        className={`mt-1 w-full min-h-9 rounded-xl px-1.5 text-left text-xs font-semibold ${node === "drive" && !orgId ? "bg-white/10" : "hover:bg-black/5"}`}
      >
        All notes (root)
      </button>
      <div className="mt-1 max-h-44 overflow-y-auto pr-0.5">
        <FolderTreeList map={pMap} parent={null} depth={0} onOpen={(id) => onOpenFolder(id, "drive")} expanded={ex} onExpand={expand} />
      </div>

      <div className="mt-4 text-[9px] font-bold uppercase text-gray-500 md:pl-0.5">Shared</div>
      <button
        type="button"
        onClick={() => {
          onPickNode("shared");
          onSetShared("with");
        }}
        className={`w-full min-h-8 rounded-lg px-1.5 text-left text-xs ${
          node === "shared" && shared === "with" ? "font-bold text-[var(--color-accent)]" : "hover:bg-black/5"
        }`}
      >
        <span className="inline-flex items-center gap-1">
          <Share2 className="h-3.5 w-3.5" />
          With you
        </span>
      </button>
      <button
        type="button"
        onClick={() => {
          onPickNode("shared");
          onSetShared("by");
        }}
        className={`mt-0.5 w-full min-h-8 rounded-lg px-1.5 text-left text-xs ${
          node === "shared" && shared === "by" ? "font-bold text-[var(--color-accent)]" : "hover:bg-black/5"
        }`}
      >
        By you
      </button>

      <div className="mt-4 text-[9px] font-bold uppercase text-gray-500 md:pl-0.5">Orgs</div>
      {orgDndId ? <DropRootPill show={dndMode === "org" && showRootDrop} dndId={orgDndId} label={orgDndLabel} /> : null}
      {orgs.map((o) => (
        <button
          key={o._id}
          type="button"
          onClick={() => {
            onSelectOrg(o._id);
            onPickNode("org");
            onOpenFolder(null, "org");
          }}
          className={`mt-0.5 w-full min-h-9 rounded-xl px-1.5 text-left text-xs font-medium ${
            node === "org" && orgId === o._id ? "bg-white/10" : "hover:bg-black/5"
          }`}
        >
          <span className="inline-flex min-w-0 items-center gap-1">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">{o.name}</span>
          </span>
        </button>
      ))}

      <div className="mt-4 text-[9px] font-bold uppercase text-gray-500 md:pl-0.5">Trash</div>
      <button
        type="button"
        onClick={() => onPickNode("trash")}
        className={`w-full min-h-9 rounded-xl px-1.5 text-left text-xs font-medium ${
          node === "trash" ? "text-red-500" : "text-gray-600"
        }`}
      >
        <span className="inline-flex items-center gap-1">
          <Trash2 className="h-3.5 w-3.5" />
          Bin
        </span>
      </button>
    </aside>
  );
}
