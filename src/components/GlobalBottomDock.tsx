"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, Calculator, CheckSquare, Loader2, Plus } from "lucide-react";
import { createSheet } from "@/lib/actions/sheet";
import { toastActionError } from "@/lib/client/actionFeedback";
import { useCalculator } from "@/context/CalculatorContext";

export default function GlobalBottomDock() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { setOpen: openCalculator } = useCalculator();
  const [fabOpen, setFabOpen] = useState(false);
  const [fabBusy, setFabBusy] = useState(false);

  const isDashboardRoot = pathname === "/dashboard";

  useEffect(() => {
    queueMicrotask(() => setFabOpen(false));
  }, [pathname]);

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-[60] flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex w-full max-w-lg items-end justify-between gap-2 px-3 sm:gap-3 sm:px-4">
        <Link
          href="/dashboard/tasks"
          className="glass-thick mb-2 flex h-14 w-14 shrink-0 touch-manipulation items-center justify-center rounded-2xl shadow-lg animate-micro hover:lift-sm active:opacity-90"
          aria-label="Tasks"
        >
          <CheckSquare className="h-6 w-6 text-[var(--color-accent)]" />
        </Link>

        <button
          type="button"
          onClick={() => openCalculator(true)}
          className="glass-thick mb-2 flex h-14 w-14 shrink-0 touch-manipulation items-center justify-center rounded-2xl shadow-lg animate-micro hover:lift-sm active:opacity-90"
          aria-label="Open calculator"
        >
          <Calculator className="h-6 w-6 text-[var(--color-accent)]" />
        </button>

        <div className="relative mb-1 shrink-0">
          {fabOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-[100] cursor-default bg-transparent"
                aria-label="Close"
                onClick={() => setFabOpen(false)}
              />
              <div className="glass-menu absolute bottom-full left-1/2 z-[110] mb-3 w-64 -translate-x-1/2 overflow-hidden rounded-2xl py-2 shadow-2xl">
                <button
                  type="button"
                  disabled={fabBusy}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
                  onClick={async () => {
                    setFabBusy(true);
                    try {
                      const id = await createSheet();
                      setFabOpen(false);
                      router.push(`/sheet/${id}`);
                    } catch (e) {
                      toastActionError(e, { id: "dock-create-sheet" });
                    } finally {
                      setFabBusy(false);
                    }
                  }}
                >
                  {fabBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  New personal note
                </button>
                {isDashboardRoot ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => {
                      setFabOpen(false);
                      router.push("/dashboard?newFolder=1");
                    }}
                  >
                    New folder…
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setFabOpen((v) => !v)}
            className="flex h-16 w-16 touch-manipulation items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-xl shadow-[var(--color-accent)]/35 animate-micro active:opacity-90 [@media(hover:hover)]:hover:brightness-110"
            aria-label="Create note"
          >
            <Plus className="h-8 w-8" strokeWidth={2.5} />
          </button>
        </div>

        <Link
          href="/dashboard/calendar"
          className="glass-thick mb-2 flex h-14 w-14 shrink-0 touch-manipulation items-center justify-center rounded-2xl shadow-lg animate-micro hover:lift-sm active:opacity-90"
          aria-label="Calendar"
        >
          <CalendarDays className="h-6 w-6 text-[var(--color-accent)]" />
        </Link>
      </div>
    </div>
  );
}
