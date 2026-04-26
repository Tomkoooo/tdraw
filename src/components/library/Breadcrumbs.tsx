"use client";

import { ChevronRight, Home } from "lucide-react";
import type { LibraryNode } from "./types";

type Crumb = { id: string | null; label: string };

export default function LibraryBreadcrumbs({
  node,
  crumbs,
  onNavigate,
}: {
  node: LibraryNode;
  crumbs: Crumb[];
  onNavigate: (id: string | null) => void;
}) {
  if (node === "home" || node === "shared" || node === "trash") {
    return (
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
        {node === "home" ? "Library" : node === "shared" ? "Shared" : "Trash"}
      </div>
    );
  }
  if (node === "org" && !crumbs.length) {
    return <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Organization</div>;
  }
  if (node === "drive" && !crumbs.length) {
    return <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">My Drive</div>;
  }

  return (
    <nav className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm font-semibold" aria-label="Breadcrumb">
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className="inline-flex min-h-9 items-center gap-1 rounded-lg px-1.5 text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/10"
        aria-label="Drive root"
      >
        {node === "org" ? <span className="text-xs">Org</span> : <Home className="h-3.5 w-3.5 opacity-60" />}
      </button>
      {crumbs.map((c, i) => (
        <span key={c.id ?? `root-${i}`} className="inline-flex min-w-0 items-center gap-0.5">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-35" />
          <button
            type="button"
            onClick={() => onNavigate(c.id)}
            className="max-w-[10rem] truncate rounded-lg px-1.5 py-0.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
          >
            {c.label}
          </button>
        </span>
      ))}
    </nav>
  );
}
