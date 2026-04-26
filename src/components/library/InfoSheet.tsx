"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Calendar, HardDrive, Loader2, Share2, Shield, User } from "lucide-react";
import { getSheetInfo } from "@/lib/actions/sheet";
import UserAvatar from "@/components/UserAvatar";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export type SheetInfoPayload = Awaited<ReturnType<typeof getSheetInfo>>;

export default function InfoSheet({ sheetId, open, onClose }: { sheetId: string | null; open: boolean; onClose: () => void }) {
  const [data, setData] = useState<SheetInfoPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !sheetId) {
      queueMicrotask(() => {
        setData(null);
        setErr(null);
        setLoading(false);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    void getSheetInfo(sheetId)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setErr(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sheetId]);

  if (!open || !sheetId || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onClose} aria-label="Close" />
      <div
        className="glass-menu relative flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] shadow-2xl sm:rounded-[1.75rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-5 py-4">
          <h2 className="text-lg font-bold tracking-tight">Note information</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
          >
            Done
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--color-accent)]" />
            </div>
          ) : err ? (
            <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
          ) : data ? (
            <div className="space-y-6 text-sm">
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <User className="h-3.5 w-3.5" />
                  Owner
                </h3>
                {data.owner ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3">
                    <UserAvatar image={data.owner.image} name={data.owner.name} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{data.owner.name}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{data.owner.email}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">Unknown</p>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Activity</h3>
                <p className="rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-gray-600 dark:text-gray-300">
                  {data.lastSavedBy ? (
                    <>
                      <span className="font-semibold text-[var(--color-text)]">Last saved</span> by {data.lastSavedBy.name}
                      {data.updatedAt ? (
                        <>
                          {" "}
                          · <span className="text-xs">{new Date(data.updatedAt).toLocaleString()}</span>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>No saves recorded yet besides creation metadata.</>
                  )}
                </p>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Live collaborators appear on the canvas while you are both connected. Detailed edit history is not stored server-side
                  beyond last save.
                </p>
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <Shield className="h-3.5 w-3.5" />
                  Your access
                </h3>
                <div className="rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3">
                  <p className="font-semibold capitalize text-[var(--color-text)]">{String(data.yourRole)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Source: {data.yourActor}
                    {data.orgMemberRole ? ` · Org membership: ${data.orgMemberRole}` : null}
                  </p>
                </div>
              </section>

              {data.organization ? (
                <section>
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <Building2 className="h-3.5 w-3.5" />
                    Organization
                  </h3>
                  <p className="rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 font-medium">
                    {data.organization.name}
                  </p>
                </section>
              ) : null}

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <Share2 className="h-3.5 w-3.5" />
                  Shares ({data.shares.length})
                </h3>
                <ul className="space-y-2">
                  {data.shares.length === 0 ? (
                    <li className="text-xs text-gray-500">No individual grants (org members may still have access).</li>
                  ) : (
                    data.shares.map((s) => (
                      <li
                        key={s.userId}
                        className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <UserAvatar image={s.image} name={s.name} size="sm" />
                          <span className="truncate font-medium">{s.name}</span>
                        </div>
                        <span className="shrink-0 rounded-full bg-[var(--color-accent)]/15 px-2 py-0.5 text-[11px] font-bold uppercase text-[var(--color-accent)]">
                          {s.role}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <Calendar className="h-3.5 w-3.5" />
                  Dates & storage
                </h3>
                <div className="grid gap-2 rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] p-4 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Created</span>
                    <span className="font-medium">{data.createdAt ? new Date(data.createdAt).toLocaleString() : "—"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Modified</span>
                    <span className="font-medium">{data.updatedAt ? new Date(data.updatedAt).toLocaleString() : "—"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="flex items-center gap-1 text-gray-500">
                      <HardDrive className="h-3 w-3" />
                      Approx. size
                    </span>
                    <span className="font-mono font-medium">{fmtBytes(data.approxBytes)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Version</span>
                    <span className="font-mono font-medium">{data.contentVersion}</span>
                  </div>
                  {data.inTrash ? <p className="col-span-2 text-amber-700 dark:text-amber-300">This note is in Trash.</p> : null}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
