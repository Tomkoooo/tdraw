"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

export default function CanvasShareSheet({
  open,
  onClose,
  title = "Share",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-canvas-share-root
      className="pointer-events-auto fixed inset-0 z-[80] flex flex-col justify-end md:items-center md:justify-center md:p-6"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-pointer bg-black/45 backdrop-blur-sm transition-opacity hover:bg-black/50"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div className="glass-thick relative z-[1] max-h-[min(92vh,40rem)] w-full overflow-hidden rounded-t-[2rem] shadow-2xl md:max-w-md md:rounded-[2rem]">
        <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-5 py-4">
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl p-2 transition-colors hover:bg-black/5 active:scale-95 dark:hover:bg-white/10 motion-reduce:active:scale-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[min(70vh,32rem)] overflow-y-auto overscroll-contain p-5 pb-safe-bottom">{children}</div>
      </div>
    </div>
  );
}
