"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptPendingSheetInviteForSession } from "@/lib/actions/share";
import { acceptPendingOrgInviteForSession } from "@/lib/actions/org";
import { toastActionError } from "@/lib/client/actionFeedback";
import type { IncomingOrgInviteRow, IncomingSheetInviteRow } from "@/lib/actions/incomingInvites";
import { ChevronLeft, FileText, Building2 } from "lucide-react";

function formatExp(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function IncomingInvitesClient({
  initialSheets,
  initialOrgs,
}: {
  initialSheets: IncomingSheetInviteRow[];
  initialOrgs: IncomingOrgInviteRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busySheet, setBusySheet] = useState<string | null>(null);
  const [busyOrg, setBusyOrg] = useState<string | null>(null);

  const acceptSheet = (sheetId: string) => {
    setBusySheet(sheetId);
    startTransition(async () => {
      try {
        const { sheetId: sid } = await acceptPendingSheetInviteForSession(sheetId);
        router.push(`/sheet/${sid}`);
        router.refresh();
      } catch (e) {
        toastActionError(e, { id: "accept-sheet-inv" });
      } finally {
        setBusySheet(null);
      }
    });
  };

  const acceptOrg = (organizationId: string) => {
    setBusyOrg(organizationId);
    startTransition(async () => {
      try {
        const { organizationId: oid } = await acceptPendingOrgInviteForSession(organizationId);
        router.push(`/dashboard?node=org&org=${encodeURIComponent(oid)}`);
        router.refresh();
      } catch (e) {
        toastActionError(e, { id: "accept-org-inv" });
      } finally {
        setBusyOrg(null);
      }
    });
  };

  const empty = initialSheets.length === 0 && initialOrgs.length === 0;

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] px-4 pb-32 pt-safe-top md:px-8">
      <div className="mx-auto max-w-3xl space-y-4 md:pt-4">
        <div className="glass-thick rounded-[1.75rem] p-4 md:p-5">
          <Link
            href="/dashboard"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-4 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
            Library
          </Link>
          <h1 className="mt-4 text-2xl font-bold md:text-3xl">Invitations</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Pending invites sent to your account email. Accept here or use the link from your email.
          </p>
        </div>

        {empty ? (
          <div className="glass-thick rounded-[1.75rem] p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No pending invitations right now.
          </div>
        ) : (
          <>
            {initialSheets.length > 0 ? (
              <section className="glass-thick rounded-[1.75rem] p-4 md:p-6">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <FileText className="h-4 w-4 text-[var(--color-accent)]" />
                  Shared notes
                </h2>
                <ul className="mt-4 divide-y divide-white/10 dark:divide-white/10">
                  {initialSheets.map((row) => (
                    <li key={row.sheetId} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--color-text)]">{row.title}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Role: {row.role}
                          {row.allowForwardShare ? " · Forward share allowed" : ""}
                          {row.inviterName ? ` · From ${row.inviterName}` : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">Expires {formatExp(row.expiresAt)}</p>
                      </div>
                      <button
                        type="button"
                        disabled={pending && busySheet === row.sheetId}
                        className="shrink-0 rounded-2xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        onClick={() => acceptSheet(row.sheetId)}
                      >
                        {busySheet === row.sheetId ? "Opening…" : "Accept"}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {initialOrgs.length > 0 ? (
              <section className="glass-thick rounded-[1.75rem] p-4 md:p-6">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Building2 className="h-4 w-4 text-[var(--color-accent)]" />
                  Organizations
                </h2>
                <ul className="mt-4 divide-y divide-white/10 dark:divide-white/10">
                  {initialOrgs.map((row) => (
                    <li
                      key={row.organizationId}
                      className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--color-text)]">{row.organizationName}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Role: {row.role}
                          {row.inviterName ? ` · Invited by ${row.inviterName}` : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">Expires {formatExp(row.expiresAt)}</p>
                      </div>
                      <button
                        type="button"
                        disabled={pending && busyOrg === row.organizationId}
                        className="shrink-0 rounded-2xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        onClick={() => acceptOrg(row.organizationId)}
                      >
                        {busyOrg === row.organizationId ? "Joining…" : "Accept & open"}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
