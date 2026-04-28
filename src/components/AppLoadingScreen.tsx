"use client";

export default function AppLoadingScreen({ label = "Loading" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--bg-canvas)]">
      <div className="glass-thick flex min-w-[14rem] flex-col items-center gap-3 rounded-3xl px-6 py-5">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-black/10 border-t-[var(--color-accent)] dark:border-white/15" />
        <p className="text-sm font-semibold">{label}</p>
        <div className="h-1.5 w-36 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--color-accent)]/70" />
        </div>
      </div>
    </div>
  );
}
