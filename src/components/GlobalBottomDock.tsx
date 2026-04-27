"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, Calculator, CheckSquare, Home, Loader2, Plus } from "lucide-react";
import { createSheet } from "@/lib/actions/sheet";
import { toastActionError } from "@/lib/client/actionFeedback";
import { useCalculator } from "@/context/CalculatorContext";

export default function GlobalBottomDock() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { setOpen: openCalculator } = useCalculator();
  const [fabOpen, setFabOpen] = useState(false);
  const [fabBusy, setFabBusy] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newNoteName, setNewNoteName] = useState("");

  const isDashboardRoot = pathname === "/dashboard";

  useEffect(() => {
    queueMicrotask(() => setFabOpen(false));
  }, [pathname]);

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-[70] flex justify-center pb-[max(0.9rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto relative w-full max-w-3xl px-3 sm:px-4">
        <div className="glass-thick relative z-[1] flex min-h-[78px] items-end justify-between rounded-[28px] px-3 pb-2 pt-2 shadow-2xl">
          <Link
            href="/dashboard"
            className={`flex min-h-[56px] min-w-[56px] touch-manipulation items-center justify-center rounded-2xl transition ${
              pathname === "/dashboard"
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/10"
            }`}
            aria-label="Dashboard"
          >
            <Home className="h-5 w-5" />
          </Link>
          <Link
            href="/dashboard/tasks"
            className={`flex min-h-[56px] min-w-[56px] touch-manipulation items-center justify-center rounded-2xl transition ${
              pathname.startsWith("/dashboard/tasks")
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/10"
            }`}
            aria-label="Tasks"
          >
            <CheckSquare className="h-5 w-5" />
          </Link>
          <button
            type="button"
            onClick={() => openCalculator(true)}
            className="flex min-h-[56px] min-w-[56px] touch-manipulation items-center justify-center rounded-2xl text-[var(--color-text)] transition hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Open calculator"
          >
            <Calculator className="h-5 w-5" />
          </button>
          <Link
            href="/dashboard/calendar"
            className={`flex min-h-[56px] min-w-[56px] touch-manipulation items-center justify-center rounded-2xl transition ${
              pathname.startsWith("/dashboard/calendar")
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/10"
            }`}
            aria-label="Calendar"
          >
            <CalendarDays className="h-5 w-5" />
          </Link>
        </div>
        {isDashboardRoot ? null : (
          /* Full-width row must not capture clicks over the dock bar — only the FAB + menu */
          <div className="relative z-[2] -mt-[74px] flex justify-center pointer-events-none">
            {fabOpen ? (
              <>
                <button
                  type="button"
                  className="pointer-events-auto fixed inset-0 z-[100] cursor-default bg-transparent"
                  aria-label="Close"
                  onClick={() => setFabOpen(false)}
                />
                <div className="pointer-events-auto glass-menu absolute bottom-full left-1/2 z-[110] mb-3 w-72 -translate-x-1/2 overflow-hidden rounded-[22px] py-2 shadow-2xl">
                  <button
                    type="button"
                    disabled={fabBusy}
                    className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
                    onClick={() => {
                      setFabOpen(false);
                      setNewNoteOpen(true);
                    }}
                  >
                    {fabBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    New personal note
                  </button>
                </div>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => setFabOpen((open) => !open)}
              className="pointer-events-auto flex h-[68px] w-[68px] touch-manipulation items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-xl shadow-[var(--color-accent)]/35 animate-micro active:opacity-90 [@media(hover:hover)]:hover:brightness-110"
              aria-label="Create note"
            >
              <Plus className="h-8 w-8" strokeWidth={2.5} />
            </button>
            {newNoteOpen ? (
              <div className="pointer-events-auto fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4">
                <div className="glass-menu w-full max-w-sm rounded-2xl p-4">
                  <h3 className="text-lg font-bold">New note</h3>
                  <input
                    autoFocus
                    className="input-field mt-3 w-full rounded-xl px-3 py-2"
                    value={newNoteName}
                    onChange={(e) => setNewNoteName(e.target.value)}
                    placeholder="Note name"
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || fabBusy) return;
                      e.preventDefault();
                      void (async () => {
                        setFabBusy(true);
                        try {
                          const id = await createSheet({ title: newNoteName });
                          setNewNoteOpen(false);
                          setNewNoteName("");
                          router.push(`/sheet/${id}`);
                        } catch (err) {
                          toastActionError(err, { id: "dock-create-sheet" });
                        } finally {
                          setFabBusy(false);
                        }
                      })();
                    }}
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      className="px-3 py-1"
                      disabled={fabBusy}
                      onClick={() => {
                        setNewNoteOpen(false);
                        setNewNoteName("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="rounded-xl bg-[var(--color-accent)] px-3 py-1.5 text-white disabled:opacity-50"
                      disabled={fabBusy}
                      onClick={async () => {
                        setFabBusy(true);
                        try {
                          const id = await createSheet({ title: newNoteName });
                          setNewNoteOpen(false);
                          setNewNoteName("");
                          router.push(`/sheet/${id}`);
                        } catch (err) {
                          toastActionError(err, { id: "dock-create-sheet" });
                        } finally {
                          setFabBusy(false);
                        }
                      }}
                    >
                      Create
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
