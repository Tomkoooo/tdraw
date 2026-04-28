"use client";

import { useCallback, useRef } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { Folder, Lock, Pin, Check } from "lucide-react";
import type { FolderTreeEntry } from "./types";
import { dndIdFolder, dndIdDropFolder } from "./types";

type Row = FolderTreeEntry;

export default function FolderCard({
  row,
  view,
  selected,
  selectMode,
  dndEnabled,
  onOpen,
  onSelectToggle,
  onContextMenu,
  canDragFolder,
}: {
  row: Row;
  view: "grid" | "list";
  selected: boolean;
  selectMode: boolean;
  dndEnabled: boolean;
  onOpen: (id: string) => void;
  onSelectToggle: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, row: Row) => void;
  canDragFolder: boolean;
}) {
  const { setNodeRef: setDrop, isOver } = useDroppable({ id: dndIdDropFolder(row._id), data: { type: "dropFolder", id: row._id } as const });
  const d = useDraggable({
    id: dndIdFolder(row._id),
    disabled: !dndEnabled || !canDragFolder || selectMode,
    data: { type: "folder", id: row._id } as const,
  });
  const t = dndEnabled && canDragFolder && !selectMode ? { transform: CSS.Translate.toString(d.transform), zIndex: d.isDragging ? 20 : undefined } : undefined;
  const setNodeRef = (el: HTMLDivElement | null) => {
    setDrop(el);
    d.setNodeRef(el);
  };

  const tLong = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearLong = useCallback(() => {
    if (tLong.current) {
      clearTimeout(tLong.current);
      tLong.current = null;
    }
  }, []);
  const onTouchStartLong = useCallback(() => {
    if (dndEnabled && canDragFolder) return;
    if (selectMode) return;
    clearLong();
    tLong.current = setTimeout(() => onSelectToggle(row._id), 500);
  }, [dndEnabled, canDragFolder, selectMode, onSelectToggle, row._id, clearLong]);
  const onTouchEndLong = useCallback(() => {
    clearLong();
  }, [clearLong]);

  if (view === "list") {
    return (
      <motion.button
        type="button"
        ref={setNodeRef as React.Ref<HTMLButtonElement>}
        style={t}
        {...(dndEnabled && canDragFolder && !selectMode ? { ...d.attributes, ...d.listeners } : {})}
        onClick={() => (selectMode ? onSelectToggle(row._id) : onOpen(row._id))}
        onContextMenu={(e) => onContextMenu(e, row)}
        onTouchStart={onTouchStartLong}
        onTouchEnd={onTouchEndLong}
        onTouchMove={clearLong}
        className={`flex w-full min-w-0 items-center gap-3 rounded-2xl p-2.5 text-left ${
          isOver ? "ring-2 ring-[var(--color-accent)]" : "glass-panel"
        } ${selected ? "ring-2 ring-[var(--color-accent)]" : ""} ${d.isDragging ? "opacity-50" : ""}`}
      >
        {selectMode ? <span className="w-8 shrink-0 text-center">{selected ? <Check className="m-auto h-4 w-4" /> : <span className="m-auto block h-3.5 w-3.5 rounded border" />}</span> : null}
        <div className="flex h-12 w-14 items-center justify-center overflow-hidden rounded-lg bg-[var(--color-accent)]/10">
          <div className="relative h-8 w-10">
            {row.coverThumbs?.slice(0, 3).map((u, i) => (
              <div
                key={i}
                className="absolute h-5 w-7 overflow-hidden rounded-sm border border-white/30 shadow-sm"
                style={{ top: i * 3, left: i * 4, zIndex: 3 - i }}
              >
                {u ? <img src={u} alt="" className="h-full w-full object-cover" /> : <Folder className="m-0.5 h-3.5 w-3.5 text-[var(--color-accent)]" />}
              </div>
            ))}
            {(!row.coverThumbs || row.coverThumbs.length === 0) ? <Folder className="m-auto h-6 w-6 text-[var(--color-accent)]" /> : null}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {row.pinned ? <Pin className="mb-0.5 mr-0.5 inline h-3 w-3 text-[var(--color-accent)]" /> : null}
            {row.name}
          </p>
          <p className="text-[10px] text-gray-500">
            {row.count} note{row.count === 1 ? "" : "s"}
            {row.accessLevel && row.accessLevel !== "owner_bypass" && row.accessLevel !== "full" ? (
              <span className="ml-1 inline-flex items-center gap-0.5">
                <Lock className="h-3 w-3" /> {row.accessLevel === "read_only" ? "read-only" : row.accessLevel}
              </span>
            ) : null}
          </p>
        </div>
      </motion.button>
    );
  }

  return (
    <div ref={setNodeRef} style={t} className="relative w-full min-h-0">
      <div
        className="absolute right-0 top-0 z-10 h-8 w-8 p-0"
        {...(dndEnabled && canDragFolder && !selectMode ? { ...d.attributes, ...d.listeners } : {})}
        aria-label="Drag folder"
      />
      <button
        type="button"
        onClick={() => (selectMode ? onSelectToggle(row._id) : onOpen(row._id))}
        onContextMenu={(e) => onContextMenu(e, row)}
        onTouchStart={onTouchStartLong}
        onTouchEnd={onTouchEndLong}
        onTouchMove={clearLong}
        className={`w-full min-h-0 rounded-3xl text-left ${
          isOver ? "ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--bg-canvas)]" : ""
        } ${selected ? "ring-2 ring-offset-1 ring-offset-[var(--bg-canvas)] ring-[var(--color-accent)]" : ""}`}
      >
        {selectMode ? (
          <div className="absolute left-2 top-2 z-10" onClick={(e) => (e.stopPropagation(), onSelectToggle(row._id))}>
            {selected ? <Check className="h-4 w-4 text-white" /> : <span className="block h-3.5 w-3.5 rounded border-2 border-white" />}
          </div>
        ) : null}
        <div className="glass-panel min-h-0 w-full cursor-pointer overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-white/45 to-white/15 p-3 shadow-sm dark:border-white/10 dark:from-white/8 dark:to-white/5">
          <div className="mb-2 flex aspect-[3/2] w-full items-end justify-center gap-0.5">
            {row.coverThumbs && row.coverThumbs.length > 0 ? (
              row.coverThumbs.map((u, i) => (
                <div key={i} className="h-16 w-[28%] max-w-[4rem] -rotate-[2deg] overflow-hidden rounded-md border border-white/40 shadow">
                  {u ? <img src={u} alt="" className="h-full w-full object-cover" /> : null}
                </div>
              ))
            ) : (
              <Folder className="h-10 w-10 text-[var(--color-accent)]/80" />
            )}
          </div>
          <p className="truncate pl-0.5 text-left text-sm font-bold">{row.name}</p>
          <p className="pl-0.5 text-left text-[10px] text-gray-500">
            {row.count} item{row.count === 1 ? "" : "s"}{" "}
            {row.lastActivity ? `· ${new Date(row.lastActivity).toLocaleDateString()}` : ""}
            {row.accessLevel && row.accessLevel !== "owner_bypass" && row.accessLevel !== "full"
              ? ` · ${row.accessLevel === "read_only" ? "read-only" : row.accessLevel}`
              : ""}
          </p>
        </div>
      </button>
    </div>
  );
}
