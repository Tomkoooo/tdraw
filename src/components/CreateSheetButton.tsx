"use client";

import { Plus } from "lucide-react";
import { createSheet } from "@/lib/actions/sheet";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CreateSheetButton({
  organizationId,
  folderId,
  label = "New Note",
}: {
  organizationId?: string;
  folderId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const id = await createSheet({ organizationId, folderId });
        router.push(`/sheet/${id}`);
      }}
      className="glass group flex aspect-[4/3] cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-[var(--color-accent)]/45 p-8 text-[var(--color-accent)] transition-all hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/8 disabled:opacity-50"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-[var(--color-accent)]/10 shadow-sm transition-transform group-hover:scale-110 group-active:scale-95">
        {loading ? (
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
        ) : (
          <Plus className="h-8 w-8" />
        )}
      </div>
      <span className="text-lg font-semibold tracking-tight">{label}</span>
    </button>
  );
}
