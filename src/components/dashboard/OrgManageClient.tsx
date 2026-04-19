"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  inviteOrganizationMember,
  listOrganizationInvites,
  removeOrganizationMember,
  updateOrganizationMemberRole,
} from "@/lib/actions/org";
import UserAvatar from "@/components/UserAvatar";
import InviteListPanel from "@/components/InviteListPanel";
import { toastActionError } from "@/lib/client/actionFeedback";

type OrgMemberRole = "admin" | "member" | "guest";

export default function OrgManageClient({
  organizationId,
  members,
  isAdmin,
}: {
  organizationId: string;
  members: { userId: string; email: string; name: string; image?: string; role: OrgMemberRole }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgMemberRole>("member");
  const [busy, setBusy] = useState(false);
  const [inviteRefresh, setInviteRefresh] = useState(0);
  const [showExpiredInvites, setShowExpiredInvites] = useState(false);
  const [inviteRows, setInviteRows] = useState<
    Awaited<ReturnType<typeof listOrganizationInvites>>["items"]
  >([]);
  const [hiddenExpiredCount, setHiddenExpiredCount] = useState(0);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [invitesError, setInvitesError] = useState<string | null>(null);

  const loadOrgInvites = useCallback(
    async (signal?: AbortSignal) => {
      if (!isAdmin) {
        setInvitesLoading(false);
        setInviteRows([]);
        setHiddenExpiredCount(0);
        setInvitesError(null);
        return;
      }
      setInvitesLoading(true);
      setInvitesError(null);
      try {
        const { items, hiddenExpiredCount: hidden } = await listOrganizationInvites(organizationId, {
          includeExpired: showExpiredInvites,
        });
        if (signal?.aborted) return;
        setInviteRows(items);
        setHiddenExpiredCount(hidden);
      } catch (e: unknown) {
        if (signal?.aborted) return;
        toastActionError(e, { id: "org-list-invites" });
        setInvitesError("Could not load invitations.");
        setInviteRows([]);
        setHiddenExpiredCount(0);
      } finally {
        if (!signal?.aborted) setInvitesLoading(false);
      }
    },
    [isAdmin, organizationId, showExpiredInvites]
  );

  useEffect(() => {
    const ac = new AbortController();
    const tid = setTimeout(() => {
      void loadOrgInvites(ac.signal);
    }, 0);
    return () => {
      ac.abort();
      clearTimeout(tid);
    };
  }, [loadOrgInvites, inviteRefresh]);

  if (!isAdmin) {
    return (
      <div className="mt-8 rounded-2xl border border-white/15 bg-black/[0.03] p-6 dark:bg-white/[0.04]">
        <h2 className="mb-3 font-semibold">Members</h2>
        <ul className="space-y-2 text-sm">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2 dark:bg-black/30"
            >
              <span className="flex min-w-0 items-center gap-3">
                <UserAvatar image={m.image} name={m.name} size="sm" />
                <span className="truncate font-medium">{m.name}</span>
              </span>
              <span className="shrink-0 text-gray-500">{m.role}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      <section className="rounded-2xl border border-white/15 bg-black/[0.03] p-6 dark:bg-white/[0.04]">
        <h2 className="mb-3 font-semibold">Invite member</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="email@company.com"
            className="flex-1 rounded-xl border border-white/20 px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as OrgMemberRole)}
            className="rounded-xl border border-white/20 px-3 py-2 text-sm"
          >
            <option value="member">Member</option>
            <option value="guest">Guest</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="button"
            disabled={busy}
            className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              try {
                await inviteOrganizationMember(organizationId, email, role);
                setEmail("");
                setInviteRefresh((n) => n + 1);
                router.refresh();
              } catch (e) {
                toastActionError(e, { id: "org-invite-member" });
              } finally {
                setBusy(false);
              }
            }}
          >
            Send
          </button>
        </div>
      </section>

      <InviteListPanel
        key={organizationId}
        title="Organization invitations"
        loading={invitesLoading}
        error={invitesError}
        rows={inviteRows.map((i) => ({
          email: i.email,
          role: i.role,
          status: i.status,
          expiresAt: i.expiresAt,
          acceptedAt: i.acceptedAt,
        }))}
        showExpired={showExpiredInvites}
        hiddenExpiredCount={hiddenExpiredCount}
        onShowExpiredChange={setShowExpiredInvites}
      />

      <section className="rounded-2xl border border-white/15 bg-black/[0.03] p-6 dark:bg-white/[0.04]">
        <h2 className="mb-3 font-semibold">Members</h2>
        <ul className="space-y-3">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/60 px-3 py-2 dark:bg-black/30"
            >
              <div className="flex min-w-0 items-center gap-3">
                <UserAvatar image={m.image} name={m.name} size="md" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.name}</div>
                  <div className="truncate text-xs text-gray-500">{m.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={m.role}
                  onChange={async (e) => {
                    const r = e.target.value as OrgMemberRole;
                    try {
                      await updateOrganizationMemberRole(organizationId, m.userId, r);
                      router.refresh();
                    } catch (err) {
                      toastActionError(err, { id: "org-role-change" });
                    }
                  }}
                  className="rounded-lg border border-white/20 bg-transparent px-2 py-1 text-xs"
                >
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                  <option value="guest">guest</option>
                </select>
                <button
                  type="button"
                  className="rounded-lg border border-red-500/40 px-2 py-1 text-xs font-semibold text-red-600"
                  onClick={async () => {
                    if (!confirm("Remove this member?")) return;
                    try {
                      await removeOrganizationMember(organizationId, m.userId);
                      router.refresh();
                    } catch (err) {
                      toastActionError(err, { id: "org-remove-member" });
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
