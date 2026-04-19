"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

export type InviteDisplayStatus = "pending" | "accepted" | "expired";

export type InviteListRow = {
  email: string;
  role: string;
  status: InviteDisplayStatus;
  expiresAt: string;
  acceptedAt: string | null;
  /** Extra line e.g. forward-share hint */
  detail?: string | null;
};

const statusLabel: Record<InviteDisplayStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  expired: "Expired",
};

function statusClass(s: InviteDisplayStatus) {
  if (s === "accepted") return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
  if (s === "pending") return "bg-amber-500/15 text-amber-900 dark:text-amber-100";
  return "bg-gray-500/15 text-gray-600 dark:text-gray-300";
}

function shortDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function InviteListPanel({
  title = "Invitations",
  loading,
  error,
  rows,
  showExpired,
  hiddenExpiredCount,
  onShowExpiredChange,
  compactPreview = 8,
}: {
  title?: string;
  loading: boolean;
  error: string | null;
  rows: InviteListRow[];
  showExpired: boolean;
  hiddenExpiredCount: number;
  onShowExpiredChange: (next: boolean) => void;
  /** How many rows to show before “Show more” */
  compactPreview?: number;
}) {
  const [showAll, setShowAll] = useState(false);

  const visibleRows = useMemo(() => {
    if (showAll || rows.length <= compactPreview) return rows;
    return rows.slice(0, compactPreview);
  }, [rows, showAll, compactPreview]);

  const hasMore = rows.length > compactPreview;

  return (
    <div className="rounded-2xl border border-[var(--glass-border)] bg-black/[0.02] p-4 dark:bg-white/[0.04]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
        {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--color-accent)]" aria-hidden /> : null}
      </div>

      {error ? (
        <p className="mb-3 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {rows.length === 0 && !loading ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {hiddenExpiredCount > 0 && !showExpired
            ? "Every invitation has expired or there are no pending invites. Use “Show expired” below to review past links."
            : "No invitations match this view. New invites appear here after you send them."}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="space-y-2">
          {visibleRows.map((r) => (
            <li
              key={`${r.email}-${r.expiresAt}-${r.status}`}
              className="flex flex-col gap-1 rounded-xl border border-[var(--glass-border)] bg-white/60 px-3 py-2 text-xs dark:bg-black/25 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-[var(--color-text)]">{r.email}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                  <span className="capitalize">{r.role}</span>
                  <span aria-hidden>·</span>
                  <span>Expires {shortDate(r.expiresAt)}</span>
                  {r.acceptedAt ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>Accepted {shortDate(r.acceptedAt)}</span>
                    </>
                  ) : null}
                </div>
                {r.detail ? <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{r.detail}</p> : null}
              </div>
              <span
                className={`shrink-0 self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold sm:self-center ${statusClass(r.status)}`}
              >
                {statusLabel[r.status]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {hasMore && !showAll ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-[var(--glass-border)] py-2 text-xs font-semibold text-[var(--color-accent)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          Show all ({rows.length})
        </button>
      ) : null}

      {hasMore && showAll ? (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-[var(--glass-border)] py-2 text-xs font-semibold text-gray-600 hover:bg-black/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.06]"
        >
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          Show fewer
        </button>
      ) : null}

      {(hiddenExpiredCount > 0 || showExpired) && (
        <div className="mt-4 border-t border-[var(--glass-border)] pt-3">
          <label className="flex cursor-pointer items-start gap-3 text-xs text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
              checked={showExpired}
              onChange={(e) => onShowExpiredChange(e.target.checked)}
            />
            <span>
              <span className="font-semibold text-[var(--color-text)]">Show expired</span>
              {!showExpired && hiddenExpiredCount > 0 ? (
                <span className="block text-[11px] text-gray-500">
                  {hiddenExpiredCount} expired invitation{hiddenExpiredCount === 1 ? "" : "s"} hidden
                </span>
              ) : null}
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
