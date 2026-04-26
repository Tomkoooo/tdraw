"use client";

import { FolderOpen, Pin, PinOff, Trash2, X } from "lucide-react";
import { motion } from "framer-motion";

export default function SelectionBar({
  count,
  onMove,
  onPin,
  onTrash,
  onCancel,
  pinLabel,
}: {
  count: number;
  onMove: () => void;
  onPin: () => void;
  onTrash: () => void;
  onCancel: () => void;
  pinLabel: "Pin" | "Unpin";
}) {
  if (count === 0) return null;
  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="glass-thick pointer-events-auto fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] left-2 right-2 z-[80] flex flex-wrap items-center justify-center gap-2 rounded-2xl p-2 shadow-xl md:bottom-8 md:left-1/2 md:right-auto md:min-w-[min(32rem,96vw)] md:-translate-x-1/2 md:p-2.5"
    >
      <span className="text-sm font-bold text-[var(--color-text)]">
        {count} selected
      </span>
      <button
        type="button"
        onClick={onMove}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--color-accent)]/12 px-3 text-sm font-bold text-[var(--color-accent)]"
      >
        <FolderOpen className="h-4 w-4" />
        Move
      </button>
      <button type="button" onClick={onPin} className="min-h-10 rounded-xl bg-black/5 px-3 text-sm font-bold dark:bg-white/10">
        {pinLabel === "Pin" ? <Pin className="mr-1 inline h-4 w-4" /> : <PinOff className="mr-1 inline h-4 w-4" />}
        {pinLabel}
      </button>
      <button
        type="button"
        onClick={onTrash}
        className="min-h-10 rounded-xl px-3 text-sm font-bold text-red-600 dark:text-red-400"
      >
        <Trash2 className="mr-1 inline h-4 w-4" />
        Trash
      </button>
      <button type="button" onClick={onCancel} className="min-h-10 rounded-xl p-2" aria-label="Cancel selection">
        <X className="h-5 w-5" />
      </button>
    </motion.div>
  );
}
