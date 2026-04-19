"use client";

import { ChevronDown, ChevronRight } from "lucide-react";

export default function SectionHeader({
  title,
  open,
  onToggle,
  right,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mb-3 flex w-full items-center justify-between rounded-2xl border border-white/15 bg-black/[0.03] px-4 py-3 text-left dark:bg-white/[0.04]"
    >
      <span className="text-lg font-bold tracking-tight">{title}</span>
      <span className="flex items-center gap-2">
        {right}
        {open ? <ChevronDown className="h-5 w-5 opacity-60" /> : <ChevronRight className="h-5 w-5 opacity-60" />}
      </span>
    </button>
  );
}
