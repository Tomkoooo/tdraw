"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createSheetInvite,
  createSheetPublicLink,
  listSheetInvites,
  listSheetPublicLinks,
  revokeSheetPublicLink,
  type CreateSheetInviteResult,
  type SheetPublicLinkListItem,
} from "@/lib/actions/share";
import { Link2, Loader2, Mail, Trash2 } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";
import InviteListPanel from "@/components/InviteListPanel";
import { toast } from "sonner";
import { readActionErrorMessage } from "@/lib/client/actionFeedback";

type ShareRole = "reader" | "editor" | "author";

const TTL_OPTIONS = [
  { h: 24, label: "24h" },
  { h: 48, label: "48h" },
  { h: 72, label: "3d" },
  { h: 168, label: "7d" },
] as const;

const PUBLIC_TTL_OPTIONS = [
  { h: 1, label: "1h" },
  { h: 24, label: "24h" },
  { h: 168, label: "7d" },
  { h: 720, label: "30d" },
] as const;

const chipBase =
  "cursor-pointer select-none rounded-full px-4 py-2 text-xs font-semibold capitalize transition-[transform,box-shadow,opacity] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";

const ttlChipBase =
  "cursor-pointer select-none min-h-[44px] min-w-[3.25rem] rounded-2xl px-3 text-sm font-semibold transition-[transform,box-shadow,opacity] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";

export default function SheetShareForm({
  sheetId,
  inviterName,
  inviterImage,
}: {
  sheetId: string;
  inviterName?: string | null;
  inviterImage?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("reader");
  const [allowForward, setAllowForward] = useState(false);
  const [ttlHours, setTtlHours] = useState<number>(48);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [inviteRefresh, setInviteRefresh] = useState(0);
  const [showExpiredInvites, setShowExpiredInvites] = useState(false);
  const [inviteRows, setInviteRows] = useState<
    Awaited<ReturnType<typeof listSheetInvites>>["items"]
  >([]);
  const [hiddenExpiredCount, setHiddenExpiredCount] = useState(0);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [invitesError, setInvitesError] = useState<string | null>(null);

  const [publicNeverExpires, setPublicNeverExpires] = useState(false);
  const [publicTtlHours, setPublicTtlHours] = useState<number>(168);
  const [publicBusy, setPublicBusy] = useState(false);
  const [publicMsg, setPublicMsg] = useState<string | null>(null);
  const [publicLinks, setPublicLinks] = useState<SheetPublicLinkListItem[]>([]);
  const [publicLinksLoading, setPublicLinksLoading] = useState(true);
  const [publicLinksError, setPublicLinksError] = useState<string | null>(null);
  const [publicLinksRefresh, setPublicLinksRefresh] = useState(0);

  const loadInvites = useCallback(
    async (signal?: AbortSignal) => {
      setInvitesLoading(true);
      setInvitesError(null);
      try {
        const { items, hiddenExpiredCount: hidden } = await listSheetInvites(sheetId, {
          includeExpired: showExpiredInvites,
        });
        if (signal?.aborted) return;
        setInviteRows(items);
        setHiddenExpiredCount(hidden);
      } catch (err: unknown) {
        if (signal?.aborted) return;
        setInvitesError(readActionErrorMessage(err));
      } finally {
        if (!signal?.aborted) setInvitesLoading(false);
      }
    },
    [sheetId, showExpiredInvites]
  );

  useEffect(() => {
    const ac = new AbortController();
    const tid = setTimeout(() => {
      void loadInvites(ac.signal);
    }, 0);
    return () => {
      ac.abort();
      clearTimeout(tid);
    };
  }, [loadInvites, inviteRefresh]);

  const loadPublicLinks = useCallback(
    async (signal?: AbortSignal) => {
      setPublicLinksLoading(true);
      setPublicLinksError(null);
      try {
        const rows = await listSheetPublicLinks(sheetId);
        if (signal?.aborted) return;
        setPublicLinks(rows);
      } catch (err: unknown) {
        if (signal?.aborted) return;
        setPublicLinksError(readActionErrorMessage(err));
      } finally {
        if (!signal?.aborted) setPublicLinksLoading(false);
      }
    },
    [sheetId],
  );

  useEffect(() => {
    const ac = new AbortController();
    const tid = setTimeout(() => {
      void loadPublicLinks(ac.signal);
    }, 0);
    return () => {
      ac.abort();
      clearTimeout(tid);
    };
  }, [loadPublicLinks, publicLinksRefresh]);

  const trimmed = email.trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  const canSubmit = !busy && emailLooksValid;

  const createPublic = async () => {
    setPublicBusy(true);
    setPublicMsg(null);
    try {
      const res = await createSheetPublicLink(sheetId, {
        neverExpires: publicNeverExpires,
        ttlHours: publicNeverExpires ? undefined : publicTtlHours,
      });
      const line = publicNeverExpires
        ? "Public link created (does not expire). Copy it below."
        : `Public link created (expires ${res.expiresAt ? new Date(res.expiresAt).toLocaleString() : ""}).`;
      setPublicMsg(line);
      toast.success(line, { id: "sheet-public-link", duration: 8000 });
      try {
        await navigator.clipboard.writeText(res.url);
        toast.message("Copied to clipboard", { id: "sheet-public-link-copy", duration: 4000 });
      } catch {
        /* clipboard may be denied */
      }
      setPublicLinksRefresh((n) => n + 1);
    } catch (err: unknown) {
      const m = readActionErrorMessage(err);
      setPublicMsg(m);
      toast.error(m, { id: "sheet-public-link-err", duration: 10_000 });
    } finally {
      setPublicBusy(false);
    }
  };

  const revokePublic = async (linkId: string) => {
    setPublicBusy(true);
    setPublicMsg(null);
    try {
      await revokeSheetPublicLink(sheetId, linkId);
      toast.success("Public link revoked.", { id: "sheet-public-revoke" });
      setPublicLinksRefresh((n) => n + 1);
    } catch (err: unknown) {
      const m = readActionErrorMessage(err);
      setPublicMsg(m);
      toast.error(m, { id: "sheet-public-revoke-err", duration: 8000 });
    } finally {
      setPublicBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setMsg(null);
    try {
      const res: CreateSheetInviteResult = await createSheetInvite(
        sheetId,
        trimmed,
        role as "reader" | "editor" | "author",
        allowForward,
        ttlHours
      );
      setEmail("");
      if (res.emailStatus === "sent") {
        const line = `Invitation sent to ${trimmed}.`;
        setMsg(line);
        toast.success(line, { id: "sheet-invite-sent", duration: 6000 });
      } else if (res.emailStatus === "skipped") {
        const line =
          "Invite saved. Email was not sent (SMTP not configured) — check the server log for the invite link.";
        setMsg(line);
        toast.message("Invite created (no email)", {
          id: "sheet-invite-skip",
          description: "Configure SMTP_HOST in the server environment to send mail.",
          duration: 12_000,
        });
      } else {
        const line =
          "Invite saved, but the email server rejected or timed out the message. The recipient can still use a link you copy from server logs if you re-send after fixing SMTP.";
        setMsg(line);
        toast.warning("Invite saved — email delivery failed", {
          id: "sheet-invite-mail-fail",
          description: "Check SMTP settings and server logs.",
          duration: 12_000,
        });
      }
      setInviteRefresh((n) => n + 1);
    } catch (err: unknown) {
      const m = readActionErrorMessage(err);
      setMsg(m);
      toast.error(m, { id: "sheet-invite-err", duration: 10_000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" aria-busy={busy}>
      {(inviterName || inviterImage) && (
        <div className="flex items-center gap-3 border-b border-[var(--glass-border)] pb-4">
          <UserAvatar image={inviterImage} name={inviterName} size="sm" />
          <div className="min-w-0 text-xs text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-[var(--color-text)]">Inviting as</span>{" "}
            <span className="truncate">{inviterName || "You"}</span>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
        <Link2 className="h-4 w-4 text-[var(--color-accent)]" />
        Public read-only link
      </div>
      <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
        Anyone with the link can open this note without signing in. They can follow live updates and use the laser;
        they cannot edit the canvas.
      </p>
      <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
        <input
          type="checkbox"
          checked={publicNeverExpires}
          onChange={(e) => setPublicNeverExpires(e.target.checked)}
          disabled={publicBusy}
          className="h-4 w-4 cursor-pointer rounded border-gray-300 disabled:cursor-not-allowed disabled:opacity-45"
        />
        Link never expires
      </label>
      {!publicNeverExpires ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Expires in
          </p>
          <div className="flex flex-wrap gap-2">
            {PUBLIC_TTL_OPTIONS.map(({ h, label }) => (
              <button
                key={h}
                type="button"
                onClick={() => setPublicTtlHours(h)}
                disabled={publicBusy}
                className={`${ttlChipBase} disabled:cursor-not-allowed disabled:opacity-45 ${
                  publicTtlHours === h
                    ? "bg-[var(--color-accent)] text-white shadow-sm hover:brightness-110"
                    : "glass-panel hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => void createPublic()}
        disabled={publicBusy}
        className="inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white shadow-md transition-[transform,filter,opacity] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-400 disabled:text-white/90 disabled:opacity-70 disabled:shadow-none disabled:hover:brightness-100 motion-reduce:active:scale-100"
      >
        {publicBusy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
        Create public link
      </button>
      {publicLinksLoading ? (
        <p className="text-xs text-gray-500">Loading public links…</p>
      ) : publicLinksError ? (
        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">{publicLinksError}</p>
      ) : publicLinks.length > 0 ? (
        <ul className="flex flex-col gap-2 border-t border-[var(--glass-border)] pt-3 text-xs">
          {publicLinks.map((row) => (
            <li
              key={row.id}
              className="flex items-start justify-between gap-2 rounded-xl border border-[var(--glass-border)] bg-black/[0.02] px-3 py-2 dark:bg-white/[0.04]"
            >
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-text)]">
                  {row.active ? "Active" : row.revokedAt ? "Revoked" : "Expired"}
                </p>
                <p className="text-gray-500 dark:text-gray-400">
                  {row.expiresAt == null ? "No expiry" : `Expires ${new Date(row.expiresAt).toLocaleString()}`}
                </p>
                <p className="text-[10px] text-gray-400">Created {new Date(row.createdAt).toLocaleString()}</p>
              </div>
              {row.active ? (
                <button
                  type="button"
                  title="Revoke link"
                  disabled={publicBusy}
                  onClick={() => void revokePublic(row.id)}
                  className="shrink-0 rounded-lg p-2 text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {publicMsg ? (
        <p className="rounded-xl border border-[var(--glass-border)] bg-black/[0.03] px-3 py-2 text-xs leading-relaxed text-gray-700 dark:bg-white/[0.06] dark:text-gray-200">
          {publicMsg}
        </p>
      ) : null}

      <div className="border-t border-[var(--glass-border)] pt-5" />
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
        <Mail className="h-4 w-4 text-[var(--color-accent)]" />
        Invite by email
      </div>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="colleague@company.com"
        className="min-h-[48px] cursor-text rounded-2xl border border-[var(--glass-border)] bg-white/70 px-4 py-3 text-sm transition-shadow focus:border-[var(--color-accent)]/40 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_22%,transparent)] focus:outline-none dark:bg-black/35"
      />
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Role</p>
        <div className="flex flex-wrap gap-2">
          {(["reader", "editor", "author"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              disabled={busy}
              className={`${chipBase} disabled:cursor-not-allowed disabled:opacity-45 ${
                role === r
                  ? "bg-[var(--color-accent)] text-white shadow-md hover:brightness-110"
                  : "glass-panel hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Link expires in
        </p>
        <div className="flex flex-wrap gap-2">
          {TTL_OPTIONS.map(({ h, label }) => (
            <button
              key={h}
              type="button"
              onClick={() => setTtlHours(h)}
              disabled={busy}
              className={`${ttlChipBase} disabled:cursor-not-allowed disabled:opacity-45 ${
                ttlHours === h
                  ? "bg-[var(--color-accent)] text-white shadow-sm hover:brightness-110"
                  : "glass-panel hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
        <input
          type="checkbox"
          checked={allowForward}
          onChange={(e) => setAllowForward(e.target.checked)}
          disabled={busy}
          className="h-4 w-4 cursor-pointer rounded border-gray-300 disabled:cursor-not-allowed disabled:opacity-45"
        />
        Allow recipient to share forward
      </label>
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white shadow-md transition-[transform,filter,opacity] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-400 disabled:text-white/90 disabled:opacity-70 disabled:shadow-none disabled:hover:brightness-100 motion-reduce:active:scale-100"
      >
        {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
        Send invite
      </button>
      {!emailLooksValid && trimmed.length > 0 ? (
        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Enter a valid email address.</p>
      ) : null}
      {msg ? (
        <p className="rounded-xl border border-[var(--glass-border)] bg-black/[0.03] px-3 py-2 text-xs leading-relaxed text-gray-700 dark:bg-white/[0.06] dark:text-gray-200">
          {msg}
        </p>
      ) : null}

      <InviteListPanel
        key={sheetId}
        title="Invitations for this note"
        loading={invitesLoading}
        error={invitesError}
        rows={inviteRows.map((i) => ({
          email: i.email,
          role: i.role,
          status: i.status,
          expiresAt: i.expiresAt,
          acceptedAt: i.acceptedAt,
          detail: i.allowForwardShare ? "Recipient may share forward" : null,
        }))}
        showExpired={showExpiredInvites}
        hiddenExpiredCount={hiddenExpiredCount}
        onShowExpiredChange={(next) => {
          setShowExpiredInvites(next);
        }}
      />
    </form>
  );
}
