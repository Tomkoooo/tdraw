"use client";

import { useState } from "react";
import { createSheetInvite } from "@/lib/actions/share";
import { Loader2, Mail } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";

type ShareRole = "reader" | "editor" | "author";

const TTL_OPTIONS = [
  { h: 24, label: "24h" },
  { h: 48, label: "48h" },
  { h: 72, label: "3d" },
  { h: 168, label: "7d" },
] as const;

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await createSheetInvite(sheetId, email, role as "reader" | "editor" | "author", allowForward, ttlHours);
      setMsg("Invitation sent (or logged if email is not configured).");
      setEmail("");
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
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
        <Mail className="h-4 w-4 text-[var(--color-accent)]" />
        Invite by email
      </div>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="colleague@company.com"
        className="min-h-[48px] rounded-2xl border border-[var(--glass-border)] bg-white/70 px-4 py-3 text-sm dark:bg-black/35"
      />
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Role</p>
        <div className="flex flex-wrap gap-2">
          {(["reader", "editor", "author"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`rounded-full px-4 py-2 text-xs font-semibold capitalize transition-all ${
                role === r
                  ? "bg-[var(--color-accent)] text-white shadow-md"
                  : "glass-panel hover:opacity-90"
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
              className={`min-h-[44px] min-w-[3.25rem] rounded-2xl px-3 text-sm font-semibold ${
                ttlHours === h ? "bg-[var(--color-accent)] text-white shadow-sm" : "glass-panel"
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
          className="h-4 w-4 rounded border-gray-300"
        />
        Allow recipient to share forward
      </label>
      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Send invite
      </button>
      {msg ? <p className="text-xs text-gray-600 dark:text-gray-400">{msg}</p> : null}
    </form>
  );
}
