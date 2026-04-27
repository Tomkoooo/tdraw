"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Building2, CheckSquare, Command, FileJson, Folder, Home, LayoutGrid, Settings, Trash2 } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useRouter } from "next/navigation";
import { createFolder } from "@/lib/actions/folder";
import { createSheet } from "@/lib/actions/sheet";
import { toastActionError } from "@/lib/client/actionFeedback";
import type { LibraryNode, OrgRow } from "./types";

export default function CommandPalette({
  open,
  onClose,
  onNavigate,
  orgs,
  manageOrgId,
  pendingInviteCount = 0,
  hasSelection,
  onOpenMove,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (node: LibraryNode) => void;
  orgs: OrgRow[];
  /** When set (org workspace open), offer a jump to members & invites. */
  manageOrgId?: string | null;
  pendingInviteCount?: number;
  hasSelection: boolean;
  onOpenMove: () => void;
}) {
  const r = useRouter();
  const { setMode, mode } = useTheme();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const items = [
    { id: "home", label: "Library home", icon: Home, run: () => (onNavigate("home"), onClose(), r.push("/dashboard?node=home")) },
    { id: "drive", label: "My Drive", icon: FileJson, run: () => (onNavigate("drive"), onClose(), r.push("/dashboard?node=drive")) },
    { id: "shared", label: "Shared", icon: FileJson, run: () => (onNavigate("shared"), onClose(), r.push("/dashboard?node=shared&sw=with")) },
    { id: "trash", label: "Trash", icon: Trash2, run: () => (onNavigate("trash"), onClose(), r.push("/dashboard?node=trash")) },
    {
      id: "invites",
      label:
        pendingInviteCount > 0
          ? `Invitations (${pendingInviteCount > 99 ? "99+" : pendingInviteCount} pending)`
          : "Invitations",
      icon: Bell,
      run: () => (r.push("/dashboard/invites"), onClose()),
    },
    { id: "settings", label: "Settings", icon: Settings, run: () => (r.push("/settings"), onClose()) },
    { id: "tasks", label: "Tasks (Kanban)", icon: CheckSquare, run: () => (r.push("/dashboard/tasks"), onClose()) },
    {
      id: "newNote",
      label: "New personal note",
      icon: FileJson,
      run: () => {
        void (async () => {
          try {
            const id = await createSheet();
            onClose();
            r.push(`/sheet/${id}`);
          } catch (e) {
            toastActionError(e, { id: "cmd-new-note" });
          }
        })();
      },
    },
    {
      id: "newFolder",
      label: "New folder in My Drive (root)",
      icon: Folder,
      run: () => {
        void (async () => {
          try {
            await createFolder({ name: "New folder", personal: true });
            onClose();
            r.refresh();
          } catch (e) {
            toastActionError(e, { id: "cmd-new-folder" });
          }
        })();
      },
    },
  ];
  for (const o of orgs) {
    items.push({
      id: `org-${o._id}`,
      label: `Open ${o.name}`,
      icon: Building2,
      run: () => (onNavigate("org"), onClose(), r.push(`/dashboard?node=org&org=${o._id}`)),
    });
  }
  if (manageOrgId) {
    const name = orgs.find((o) => o._id === manageOrgId)?.name;
    items.push({
      id: "manage-org",
      label: name ? `Manage “${name}”` : "Manage organization",
      icon: Building2,
      run: () => {
        r.push(`/dashboard/org/${manageOrgId}`);
        onClose();
      },
    });
  }
  items.push(
    {
      id: "theme",
      label: "Cycle theme: system → light → dark",
      icon: LayoutGrid,
      run: () => {
        if (mode === "system") setMode("light");
        else if (mode === "light") setMode("dark");
        else setMode("system");
        onClose();
      },
    },
    ...(hasSelection ? ([{ id: "moveSel", label: "Move selected…", icon: Folder, run: () => (onOpenMove(), onClose()) }] as const) : []),
  );

  const t = q.trim().toLowerCase();
  const list = t ? items.filter((x) => x.label.toLowerCase().includes(t) || x.id.toLowerCase().includes(t)) : items;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[15vh] backdrop-blur-sm">
      <div className="glass-menu w-full max-w-md overflow-hidden rounded-3xl shadow-2xl">
        <div className="border-b border-white/10 p-3 dark:border-white/5">
          <div className="flex items-center gap-2 text-gray-500">
            <Command className="h-4 w-4" />
            <input
              autoFocus
              className="w-full min-h-10 bg-transparent text-sm font-semibold outline-none placeholder:text-gray-400"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type a command or search"
            />
          </div>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1">
          {list.map((it) => {
            const I = it.icon;
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={it.run}
                  className="flex w-full min-h-11 items-center gap-2 rounded-2xl px-3 text-left text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {I ? <I className="h-4 w-4 opacity-60" /> : null}
                  {it.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <button type="button" className="fixed inset-0 -z-10" onClick={onClose} aria-label="Close" />
    </div>,
    document.body
  );
}
