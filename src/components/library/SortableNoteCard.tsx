"use client";

import { useCallback, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { Pencil, Pin, Check, GripVertical, MoreHorizontal, Lock } from "lucide-react";
import { motion } from "framer-motion";
import type { SheetCard } from "./types";
import { dndIdNote, dndIdDropFolder, DND_DROP_F } from "./types";

/** Sortable + draggable; drop targets on folders use separate ids. */
export default function SortableNoteCard({
  sheet,
  view,
  selected,
  selectMode,
  dndEnabled,
  docPresence,
  onSelectToggle,
  onContextMenu,
  sortable = true,
}: {
  sheet: SheetCard;
  view: "grid" | "list";
  selected: boolean;
  selectMode: boolean;
  dndEnabled: boolean;
  onSelectToggle: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, sheet: SheetCard) => void;
  sortable?: boolean;
  /** Live presence on this note (from doc:activity). */
  docPresence?: { userId: string; name: string; image?: string; editing?: boolean; active?: boolean }[] | null;
}) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners, isOver } = useSortable({
    id: dndIdNote(sheet._id),
    disabled: !dndEnabled || !sortable || selectMode,
  });
  const t = dndEnabled && !selectMode
    ? { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 30 : undefined }
    : undefined;

  const tLong = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearLong = useCallback(() => {
    if (tLong.current) {
      clearTimeout(tLong.current);
      tLong.current = null;
    }
  }, []);
  const onTouchStartLong = useCallback(() => {
    if (dndEnabled || selectMode) return;
    clearLong();
    tLong.current = setTimeout(() => onSelectToggle(sheet._id), 500);
  }, [dndEnabled, selectMode, onSelectToggle, sheet._id, clearLong]);

  if (view === "list") {
    return (
      <motion.div
        ref={setNodeRef}
        style={t}
        layout
        className={`glass-panel flex min-w-0 items-stretch overflow-hidden rounded-2xl ${
          selected ? "ring-2 ring-[var(--color-accent)]" : ""
        } ${isDragging ? "z-20 opacity-60" : ""}`}
        onContextMenu={(e) => onContextMenu(e, sheet)}
        onTouchStart={onTouchStartLong}
        onTouchEnd={clearLong}
        onTouchMove={clearLong}
      >
        {dndEnabled && !selectMode ? (
          <button type="button" className="touch-none shrink-0 rounded-l-xl p-2 text-gray-500 hover:bg-black/5" {...attributes} {...listeners} aria-label="Drag">
            <GripVertical className="h-4 w-4" />
          </button>
        ) : null}
        {selectMode ? (
          <button type="button" className="w-10 shrink-0" onClick={() => onSelectToggle(sheet._id)} aria-pressed={selected}>
            {selected ? <Check className="m-auto h-4 w-4 text-[var(--color-accent)]" /> : <span className="m-auto block h-4 w-4 rounded border border-white/20" />}
          </button>
        ) : null}
        <Link href={`/sheet/${sheet._id}`} className="flex min-w-0 flex-1 items-center gap-3 p-2.5 pr-2" onClick={(e) => (selectMode ? (e.preventDefault(), onSelectToggle(sheet._id), undefined) : null)}>
          <div className="h-12 w-14 shrink-0 overflow-hidden rounded-lg bg-white/50 dark:bg-black/25">
            {sheet.previewImage ? (
              <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
            ) : (
              <Pencil className="m-auto block h-5 w-5 pt-2.5 text-gray-400" />
            )}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <h3 className="truncate text-sm font-semibold">
              {sheet.pinned ? <Pin className="mr-0.5 inline h-3 w-3 text-[var(--color-accent)]" /> : null}
              {sheet.title}
            </h3>
            <p className="text-[10px] text-gray-500">{new Date(sheet.updatedAt).toLocaleDateString()}</p>
            {sheet.accessLevel && sheet.accessLevel !== "owner_bypass" && sheet.accessLevel !== "full" ? (
              <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                <Lock className="h-3 w-3" />
                {sheet.accessLevel === "read_only" ? "read-only" : sheet.accessLevel}
              </p>
            ) : null}
            {docPresence && docPresence.length > 0 ? (
              <div className="mt-1 flex items-center gap-1">
                {docPresence.slice(0, 4).map((p, i) => (
                  <span
                    key={`${p.userId}-${i}`}
                    className={`inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-white/70 bg-black/10 text-[9px] font-semibold text-white dark:border-white/25 ${
                      p.editing ? "ring-1 ring-emerald-400" : ""
                    }`}
                    title={`${p.name}${p.editing ? " (editing)" : " (online)"}`}
                  >
                    {p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : (p.name || "U").slice(0, 1).toUpperCase()}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </Link>
        {!selectMode ? (
          <button
            type="button"
            className="glass-panel shrink-0 touch-manipulation rounded-xl p-2 text-gray-600 hover:bg-black/10 dark:text-gray-300 dark:hover:bg-white/10"
            aria-label="Note actions"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(e, sheet);
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        ) : null}
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={t}
      layout
      className={`relative w-full min-h-0 ${
        selected ? "ring-2 ring-offset-2 ring-offset-[var(--bg-canvas)] ring-[var(--color-accent)]" : "rounded-3xl"
      } ${isDragging ? "z-20 opacity-70" : ""}`}
      onContextMenu={(e) => onContextMenu(e, sheet)}
      onTouchStart={onTouchStartLong}
      onTouchEnd={clearLong}
      onTouchMove={clearLong}
    >
      {dndEnabled && !selectMode ? (
        <button
          type="button"
          className="absolute right-0 top-0 z-20 touch-none rounded-2xl bg-black/30 p-2"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder or move to folder"
        />
      ) : null}
      {selectMode ? (
        <button
          type="button"
          className="absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelectToggle(sheet._id);
          }}
        >
          {selected ? <Check className="h-4 w-4" /> : <span className="h-3.5 w-3.5 rounded border-2 border-white/80" />}
        </button>
      ) : null}
      <Link
        href={`/sheet/${sheet._id}`}
        className="glass-panel block aspect-[4/3] overflow-hidden rounded-3xl p-3 pr-1 pt-9 shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99]"
        onClick={(e) => (selectMode ? (e.preventDefault(), onSelectToggle(sheet._id), undefined) : null)}
      >
        <div className="mb-1 flex h-[60%] items-center justify-center overflow-hidden rounded-2xl bg-white/40 dark:bg-black/20">
          {sheet.previewImage ? (
            <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
          ) : (
            <Pencil className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          )}
        </div>
        <h3 className="line-clamp-2 pr-1 text-left text-sm font-bold leading-snug">
          {sheet.pinned ? <Pin className="mb-0.5 mr-0.5 inline h-3 w-3 text-[var(--color-accent)]" /> : null}
          {sheet.title}
        </h3>
        <p className="text-[9px] uppercase text-gray-500 dark:text-gray-500">{new Date(sheet.updatedAt).toLocaleDateString()}</p>
        {sheet.accessLevel && sheet.accessLevel !== "owner_bypass" && sheet.accessLevel !== "full" ? (
          <p className="mt-0.5 inline-flex items-center gap-1 text-[9px] uppercase text-amber-600 dark:text-amber-400">
            <Lock className="h-3 w-3" />
            {sheet.accessLevel === "read_only" ? "read-only" : sheet.accessLevel}
          </p>
        ) : null}
        {docPresence && docPresence.length > 0 ? (
          <div className="mt-1 flex items-center gap-1">
            {docPresence.slice(0, 5).map((p, i) => (
              <span
                key={`${p.userId}-${i}`}
                className={`inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-white/70 bg-black/10 text-[9px] font-semibold text-white dark:border-white/25 ${
                  p.editing ? "ring-1 ring-emerald-400" : ""
                }`}
                title={`${p.name}${p.editing ? " (editing)" : " (online)"}`}
              >
                {p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : (p.name || "U").slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
        ) : null}
      </Link>
      {!selectMode ? (
        <button
          type="button"
          className="absolute bottom-3 right-3 z-30 flex h-9 w-9 touch-manipulation items-center justify-center rounded-full bg-black/45 text-white shadow-md backdrop-blur-sm hover:bg-black/55 dark:bg-white/20 dark:hover:bg-white/30"
          aria-label="Note actions"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(e, sheet);
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      ) : null}
    </motion.div>
  );
}

// Re-export dnd for shell's parse
export { dndIdNote, dndIdDropFolder, DND_DROP_F };
