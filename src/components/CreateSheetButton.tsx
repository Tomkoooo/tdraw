"use client";

import { Plus } from "lucide-react";
import { createSheet } from "@/lib/actions/sheet";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CreateSheetButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const id = await createSheet();
        router.push(`/sheet/${id}`);
      }}
      className="glass flex flex-col items-center justify-center p-8 rounded-[2rem] aspect-[4/3] border-2 border-dashed border-[#0071E3]/40 hover:border-[#0071E3] hover:bg-[#0071E3]/5 transition-all text-[#0071E3] cursor-pointer group disabled:opacity-50"
    >
      <div className="w-16 h-16 rounded-[1.5rem] bg-[#0071E3]/10 flex items-center justify-center mb-4 group-hover:scale-110 group-active:scale-95 transition-transform shadow-sm">
        {loading ? (
          <div className="w-6 h-6 border-2 border-[#0071E3] border-t-transparent rounded-full animate-spin" />
        ) : (
          <Plus className="w-8 h-8" />
        )}
      </div>
      <span className="text-lg font-semibold tracking-tight">New Note</span>
    </button>
  );
}
