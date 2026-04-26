"use client";

import { useCallback, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { Pencil, Pin, Check } from "lucide-react";
import { motion } from "framer-motion";
import type { SheetCard } from "./types";
import { dndIdNote } from "./types";

export default function NoteCard({
  sheet,
  view,
  selected,
  selectMode,
  dndEnabled,
  onSelectToggle,
  onContextMenu,
}: {
  sheet: SheetCard;
  view: "grid" | "list";
  selected: boolean;
  selectMode: boolean;
  dndEnabled: boolean;
  onSelectToggle: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, sheet: SheetCard) => void;
}) {
  const { setNodeRef, transform, isDragging, attributes, listeners } = useDraggable({
    id: dndIdNote(sheet._id),
    disabled: !dndEnabled || selectMode,
    data: { type: "note", id: sheet._id } as const,
  });
  const t = dndEnabled && !selectMode ? { transform: CSS.Translate.toString(transform), zIndex: isDragging ? 50 : undefined } : undefined;

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
  const onTouchEndLong = useCallback(() => {
    clearLong();
  }, [clearLong]);

  if (view === "list") {
    return (
      <motion.div
        ref={setNodeRef}
        style={t}
        layout
        className={`glass-panel flex min-w-0 items-stretch gap-0 overflow-hidden rounded-2xl ${
          selected ? "ring-2 ring-[var(--color-accent)]" : ""
        } ${isDragging ? "opacity-50" : ""}`}
        {...(dndEnabled && !selectMode ? { ...attributes, ...listeners } : {})}
        onContextMenu={(e) => onContextMenu(e, sheet)}
        onTouchStart={onTouchStartLong}
        onTouchEnd={onTouchEndLong}
        onTouchMove={clearLong}
      >
        {selectMode ? (
          <button type="button" className="w-10 shrink-0" onClick={() => onSelectToggle(sheet._id)} aria-pressed={selected}>
            {selected ? <Check className="m-auto h-4 w-4 text-[var(--color-accent)]" /> : <span className="m-auto block h-4 w-4 rounded border border-white/20" />}
          </button>
        ) : null}
        <Link href={`/sheet/${sheet._id}`} className="flex min-w-0 flex-1 items-center gap-3 p-2.5 pr-3" onClick={(e) => (selectMode ? (e.preventDefault(), onSelectToggle(sheet._id), undefined) : null)}>
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
          </div>
        </Link>
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
      } ${isDragging ? "z-20 opacity-60" : ""}`}
      onContextMenu={(e) => onContextMenu(e, sheet)}
      onTouchStart={onTouchStartLong}
      onTouchEnd={onTouchEndLong}
      onTouchMove={clearLong}
    >
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
      <div
        className="absolute right-0 top-0 z-10 h-8 w-8 p-0 touch-none"
        {...(dndEnabled && !selectMode ? { ...attributes, ...listeners } : {})}
        aria-label="Drag"
      />
      <Link
        href={`/sheet/${sheet._id}`}
        className="glass-panel block aspect-[4/3] overflow-hidden rounded-3xl p-3 pt-8 shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99]"
        onClick={(e) => (selectMode ? (e.preventDefault(), onSelectToggle(sheet._id), undefined) : null)}
      >
        <div className="mb-1 flex h-[60%] items-center justify-center overflow-hidden rounded-2xl bg-white/40 dark:bg-black/20">
          {sheet.previewImage ? (
            <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
          ) : (
            <Pencil className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          )}
        </div>
        <h3 className="line-clamp-2 text-left text-sm font-bold leading-snug">
          {sheet.pinned ? <Pin className="mb-0.5 mr-0.5 inline h-3 w-3 text-[var(--color-accent)]" /> : null}
          {sheet.title}
        </h3>
        <p className="text-[9px] uppercase text-gray-500 dark:text-gray-500">{new Date(sheet.updatedAt).toLocaleDateString()}</p>
      </Link>
    </motion.div>
  );
}
