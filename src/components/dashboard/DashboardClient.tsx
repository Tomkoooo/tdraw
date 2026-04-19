"use client";

import Link from "next/link";
import {
  Building2,
  CalendarDays,
  CheckSquare,
  History,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Search,
  Share2,
  Sparkles,
  UserRound,
} from "lucide-react";
import CreateSheetButton from "@/components/CreateSheetButton";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createFolder } from "@/lib/actions/folder";
import { createOrganization } from "@/lib/actions/org";
import { permanentlyDeleteSheet, restoreSheetFromTrash } from "@/lib/actions/sheet";
import { permanentlyDeleteFolder, restoreFolderFromTrash } from "@/lib/actions/folder";
import { usePathname, useRouter } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import UserAvatar from "@/components/UserAvatar";
import ThemeToggle from "@/components/ThemeToggle";
import { SortableMyDriveSheets, SortablePersonalFolders, type FolderRow, type SheetCard } from "./DriveSortables";
import OrgSheetsSortable from "./OrgSheetsSortable";
import SheetCardMenu from "./SheetCardMenu";
import OrgWorkspaceRealtime, { type DocEditActivity, type OnlineMember } from "@/components/realtime/OrgWorkspaceRealtime";
import { toastActionError } from "@/lib/client/actionFeedback";
import { readSheetVisits, SHEET_VISIT_STORAGE_KEY, type SheetVisitEntry } from "@/lib/client/sheetVisitLog";

type OrgRow = { _id: string; name: string; role: string; createdByUserId: string };

type Segment = "recent" | "drive" | "shared" | "orgs" | "trash";

type RecentKind = "personal" | "shared_with" | "shared_by" | "org";

type RecentRow = SheetCard & {
  recentKind: RecentKind;
  sharedRole?: string;
  orgId?: string;
  orgName?: string;
};

const RECENT_LIST_CAP = 48;

function recentActivityMs(sheet: SheetCard, visits: Record<string, SheetVisitEntry>) {
  const updated = new Date(sheet.updatedAt).getTime();
  const v = visits[sheet._id];
  return Math.max(updated, v?.lastVisitMs ?? 0);
}
type SharedSub = "with" | "by";
type DriveSort = "alpha" | "created" | "updated";

function fmtStorage(used: number, quota: number) {
  const gb = (n: number) => (n / (1024 * 1024 * 1024)).toFixed(2);
  return `${gb(used)} / ${gb(quota)} GB`;
}

function EmptyDrive() {
  return (
    <div className="glass-panel mx-auto flex max-w-md flex-col items-center gap-6 px-8 py-14 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-[1.75rem] bg-[var(--color-accent)]/12 text-[var(--color-accent)]">
        <Sparkles className="h-11 w-11" strokeWidth={1.25} />
      </div>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Your desk is clear</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Start a note or a folder — everything syncs and stays where you left it.
        </p>
      </div>
      <CreateSheetButton />
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Tap <span className="font-semibold text-[var(--color-accent)]">+</span> to create a folder or note.
      </p>
    </div>
  );
}

function EmptyShared() {
  return (
    <div className="glass-panel mx-auto flex max-w-md flex-col items-center gap-5 px-8 py-12 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
        <Share2 className="h-9 w-9" strokeWidth={1.25} />
      </div>
      <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
        Invited notes show up here with your role. Ask a collaborator to share a sheet with your email.
      </p>
    </div>
  );
}

function EmptyRecent() {
  return (
    <div className="glass-panel mx-auto flex max-w-md flex-col items-center gap-5 px-8 py-12 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
        <History className="h-9 w-9" strokeWidth={1.25} />
      </div>
      <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
        Open any note to build this list. We rank by your last visit and recent edits (including shared and org notes).
      </p>
    </div>
  );
}

function EmptyOrgs() {
  return (
    <div className="glass-panel mx-auto flex max-w-md flex-col items-center gap-5 px-8 py-12 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
        <Building2 className="h-9 w-9" strokeWidth={1.25} />
      </div>
      <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
        Join organizations you are invited to, or create one workspace of your own (one created org per account).
      </p>
    </div>
  );
}

export default function DashboardClient(props: {
  userId: string;
  userFirstName: string;
  userDisplayName?: string;
  userImage?: string | null;
  mine: SheetCard[];
  shared: (SheetCard & { role?: string })[];
  sharedByMe: SheetCard[];
  orgs: OrgRow[];
  orgSheetsByOrg: Record<string, SheetCard[]>;
  personalFolders: FolderRow[];
  trashedSheets: SheetCard[];
  trashedFolders: FolderRow[];
  personalStorage: { used: number; quota: number };
  orgStorageByOrg: Record<string, { used: number; quota: number }>;
}) {
  const {
    userId,
    userFirstName,
    userDisplayName,
    userImage,
    mine,
    shared,
    sharedByMe,
    orgs,
    orgSheetsByOrg,
    personalFolders,
    trashedSheets,
    trashedFolders,
    personalStorage,
    orgStorageByOrg,
  } = props;
  const router = useRouter();
  const pathname = usePathname() ?? "";

  const [segment, setSegment] = useState<Segment>("drive");
  const [visitLog, setVisitLog] = useState<Record<string, SheetVisitEntry>>({});
  const [sharedSub, setSharedSub] = useState<SharedSub>("with");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [driveSort, setDriveSort] = useState<DriveSort>("updated");
  const [newOrg, setNewOrg] = useState("");
  const [orgTab, setOrgTab] = useState<string | null>(orgs[0]?._id ?? null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderModalName, setFolderModalName] = useState("");
  const [folderCreating, setFolderCreating] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (u.searchParams.get("newFolder") === "1") {
      u.searchParams.delete("newFolder");
      const qs = u.searchParams.toString();
      window.history.replaceState({}, "", `${u.pathname}${qs ? `?${qs}` : ""}${u.hash}`);
      queueMicrotask(() => {
        setFolderModalName("");
        setFolderModalOpen(true);
      });
    }
  }, []);

  const [mineOrder, setMineOrder] = useState(mine);
  const [folderOrder, setFolderOrder] = useState(personalFolders);
  const [orgSheetOrder, setOrgSheetOrder] = useState<Record<string, SheetCard[]>>(orgSheetsByOrg);
  const [orgOnlineMembers, setOrgOnlineMembers] = useState<OnlineMember[]>([]);
  const [orgDocBySheet, setOrgDocBySheet] = useState<Record<string, DocEditActivity | null>>({});

  const userOwnsAnOrg = orgs.some((o) => o.createdByUserId === userId);

  useEffect(() => {
    queueMicrotask(() => setMineOrder(mine));
  }, [mine]);
  useEffect(() => {
    queueMicrotask(() => setFolderOrder(personalFolders));
  }, [personalFolders]);
  useEffect(() => {
    queueMicrotask(() => setOrgSheetOrder(orgSheetsByOrg));
  }, [orgSheetsByOrg]);

  useEffect(() => {
    queueMicrotask(() => {
      setOrgDocBySheet({});
      setOrgOnlineMembers([]);
    });
  }, [orgTab]);

  useEffect(() => {
    queueMicrotask(() => setMoreOpen(false));
  }, [pathname]);

  useEffect(() => {
    const sync = () => setVisitLog(readSheetVisits());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === SHEET_VISIT_STORAGE_KEY) sync();
    };
    const onVisit = () => sync();
    const onVis = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("tdraw:sheet-visit", onVisit);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("tdraw:sheet-visit", onVisit);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pathname]);

  const sheetMenuBase = useMemo(
    () =>
      userId
        ? {
            currentUserId: userId,
            inviterName: userDisplayName ?? userFirstName,
            inviterImage: userImage ?? null,
          }
        : null,
    [userId, userDisplayName, userFirstName, userImage]
  );

  const sortSheets = useCallback(
    (rows: SheetCard[]) => {
      const t = q.trim().toLowerCase();
      const base = t ? rows.filter((s) => s.title.toLowerCase().includes(t)) : [...rows];
      base.sort((a, b) => {
        const fa = a.folderId ? 1 : 0;
        const fb = b.folderId ? 1 : 0;
        if (fa !== fb) return fa - fb;
        if (driveSort === "alpha") return a.title.localeCompare(b.title);
        if (driveSort === "created") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      return base;
    },
    [q, driveSort]
  );

  const sortFolders = useCallback(
    (rows: FolderRow[]) => {
      const t = q.trim().toLowerCase();
      const base = t ? rows.filter((f) => f.name.toLowerCase().includes(t)) : [...rows];
      base.sort((a, b) => {
        const pa = a.pinned ? 1 : 0;
        const pb = b.pinned ? 1 : 0;
        if (pa !== pb) return pb - pa;
        if (driveSort === "alpha") return a.name.localeCompare(b.name);
        if (driveSort === "created")
          return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
        return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
      });
      return base;
    },
    [q, driveSort]
  );

  const filteredMine = useMemo(() => sortSheets(mineOrder), [mineOrder, sortSheets]);
  const filteredFolders = useMemo(() => sortFolders(folderOrder), [folderOrder, sortFolders]);

  const filteredSharedWith = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return shared;
    return shared.filter((s) => s.title.toLowerCase().includes(t));
  }, [shared, q]);

  const filteredSharedBy = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return sharedByMe;
    return sharedByMe.filter((s) => s.title.toLowerCase().includes(t));
  }, [sharedByMe, q]);

  const filteredOrgSheets = useMemo(() => {
    const orgSheets = orgTab ? (orgSheetOrder[orgTab] ?? orgSheetsByOrg[orgTab] ?? []) : [];
    const t = q.trim().toLowerCase();
    if (!t) return orgSheets;
    return orgSheets.filter((s) => s.title.toLowerCase().includes(t));
  }, [orgTab, orgSheetOrder, orgSheetsByOrg, q]);

  const unifiedRecentRows = useMemo(() => {
    const byId = new Map<string, RecentRow>();
    for (const org of orgs) {
      const sheets = orgSheetOrder[org._id] ?? orgSheetsByOrg[org._id] ?? [];
      for (const s of sheets) {
        byId.set(s._id, { ...s, recentKind: "org", orgId: org._id, orgName: org.name });
      }
    }
    for (const s of mineOrder) {
      if (byId.has(s._id)) continue;
      byId.set(s._id, { ...s, recentKind: "personal" });
    }
    for (const s of shared) {
      if (byId.has(s._id)) continue;
      byId.set(s._id, { ...s, recentKind: "shared_with", sharedRole: s.role });
    }
    for (const s of sharedByMe) {
      if (byId.has(s._id)) continue;
      byId.set(s._id, { ...s, recentKind: "shared_by" });
    }
    return Array.from(byId.values());
  }, [orgs, orgSheetOrder, orgSheetsByOrg, mineOrder, shared, sharedByMe]);

  const filteredRecent = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t ? unifiedRecentRows.filter((s) => s.title.toLowerCase().includes(t)) : [...unifiedRecentRows];
    base.sort((a, b) => {
      const primary = recentActivityMs(b, visitLog) - recentActivityMs(a, visitLog);
      if (primary !== 0) return primary;
      const ca = visitLog[a._id]?.count ?? 0;
      const cb = visitLog[b._id]?.count ?? 0;
      return cb - ca;
    });
    return base.slice(0, RECENT_LIST_CAP);
  }, [unifiedRecentRows, visitLog, q]);

  const segmentLabel =
    segment === "recent"
      ? "Recent"
      : segment === "drive"
        ? "My Drive"
        : segment === "shared"
          ? "Shared"
          : segment === "trash"
            ? "Trash"
            : "Organizations";

  const currentOrgRole = orgs.find((o) => o._id === orgTab)?.role ?? "member";

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-canvas)]">
      <OrgWorkspaceRealtime
        organizationId={segment === "orgs" && orgTab ? orgTab : null}
        userName={userDisplayName ?? userFirstName}
        userImage={userImage}
        onOnlineChange={setOrgOnlineMembers}
        onDocActivity={setOrgDocBySheet}
      />
      <header className="sticky top-0 z-40 pt-safe-top">
        <div className="glass-thick mx-3 mt-3 rounded-[1.75rem] px-4 py-3 shadow-[var(--shadow-float)] md:mx-6 md:rounded-[2rem] md:px-6 md:py-4">
          <div className="flex flex-wrap items-center gap-3">
            <UserAvatar
              image={userImage}
              name={userDisplayName ?? userFirstName}
              size="lg"
              className="ring-2 ring-black/5 dark:ring-white/10"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {segmentLabel}
              </p>
              <h1 className="truncate text-xl font-bold tracking-tight md:text-2xl">Hello, {userFirstName}</h1>
            </div>
            <ThemeToggle />
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                className="glass-panel flex h-11 w-11 items-center justify-center rounded-2xl animate-micro hover:lift-sm active:scale-95"
                aria-label="More"
                aria-expanded={moreOpen}
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
              {moreOpen ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-[100] cursor-default bg-transparent"
                    aria-label="Close menu"
                    onClick={() => setMoreOpen(false)}
                  />
                  <div className="glass-menu absolute right-0 top-12 z-[110] min-w-[12rem] overflow-hidden rounded-2xl py-2 shadow-xl">
                    <Link
                      href="/dashboard/tasks"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
                      onClick={() => setMoreOpen(false)}
                    >
                      <CheckSquare className="h-4 w-4 opacity-70" />
                      Tasks
                    </Link>
                    <Link
                      href="/dashboard/calendar"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
                      onClick={() => setMoreOpen(false)}
                    >
                      <CalendarDays className="h-4 w-4 opacity-70" />
                      Calendar
                    </Link>
                    <Link
                      href="/settings"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
                      onClick={() => setMoreOpen(false)}
                    >
                      <UserRound className="h-4 w-4 opacity-70" />
                      Settings
                    </Link>
                    <div className="my-1 border-t border-white/10 dark:border-white/10" />
                    <div className="px-2 py-1">
                      <LogoutButton />
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex w-full gap-1 rounded-[1.35rem] bg-black/[0.04] p-1 dark:bg-white/[0.06]">
            {(
              [
                ["recent", "Recent"],
                ["drive", "Drive"],
                ["shared", "Shared"],
                ["orgs", "Orgs"],
                ["trash", "Trash"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSegment(id)}
                className={`min-h-[44px] flex-1 rounded-[1.1rem] px-1 text-xs font-semibold transition-all duration-200 sm:text-sm ${
                  segment === id
                    ? "glass-panel text-[var(--color-text)] shadow-sm"
                    : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${segmentLabel.toLowerCase()}…`}
                className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] py-3 pl-10 pr-3 text-sm"
              />
            </div>
            {segment === "drive" ? (
              <select
                value={driveSort}
                onChange={(e) => setDriveSort(e.target.value as DriveSort)}
                className="min-h-[44px] rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 text-sm font-semibold"
                aria-label="Sort"
              >
                <option value="alpha">A–Z</option>
                <option value="created">Newest</option>
                <option value="updated">Last updated</option>
              </select>
            ) : null}
            <div className="flex rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] p-1">
              <button
                type="button"
                aria-label="Grid view"
                onClick={() => setView("grid")}
                className={`rounded-xl p-2.5 ${view === "grid" ? "glass-panel shadow-sm" : "opacity-50"}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="List view"
                onClick={() => setView("list")}
                className={`rounded-xl p-2.5 ${view === "list" ? "glass-panel shadow-sm" : "opacity-50"}`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-3 py-6 md:px-6">
        {segment === "recent" ? (
          <div className="mx-auto max-w-6xl space-y-3">
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">
              Sorted by your last visit and recent edits. Up to {RECENT_LIST_CAP} notes.
            </p>
            {unifiedRecentRows.length === 0 ? (
              <EmptyRecent />
            ) : filteredRecent.length === 0 ? (
              <p className="text-center text-sm text-gray-500">No notes match your search.</p>
            ) : (
              <div
                className={
                  view === "grid"
                    ? "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
                    : "flex flex-col gap-2"
                }
              >
                {filteredRecent.map((sheet) => {
                  const badge =
                    sheet.recentKind === "org"
                      ? sheet.orgName ?? "Organization"
                      : sheet.recentKind === "shared_with"
                        ? `Shared · ${sheet.sharedRole ?? "reader"}`
                        : sheet.recentKind === "shared_by"
                          ? "You invited others"
                          : "Personal";
                  const FallbackIcon =
                    sheet.recentKind === "org" ? Building2 : sheet.recentKind === "personal" ? Pencil : Share2;
                  const menuVariant =
                    sheet.recentKind === "personal"
                      ? ("personal" as const)
                      : sheet.recentKind === "org"
                        ? ("org" as const)
                        : sheet.recentKind === "shared_by"
                          ? ("sharedByMe" as const)
                          : null;
                  const orgRole = sheet.orgId ? (orgs.find((o) => o._id === sheet.orgId)?.role ?? "member") : undefined;
                  const showMenu = sheetMenuBase && menuVariant;
                  return view === "grid" ? (
                    <div key={sheet._id} className="relative aspect-[4/3] min-h-0">
                      {showMenu ? (
                        <div className="absolute left-2 top-2 z-10" onClick={(e) => e.preventDefault()}>
                          <SheetCardMenu
                            sheet={sheet}
                            variant={menuVariant}
                            orgRole={orgRole}
                            {...sheetMenuBase}
                          />
                        </div>
                      ) : null}
                      <Link
                        href={`/sheet/${sheet._id}`}
                        className={`glass-panel flex h-full flex-col overflow-hidden p-4 shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99] ${showMenu ? "pt-11" : ""}`}
                      >
                        <div className="mb-2 flex flex-1 items-center justify-center overflow-hidden rounded-2xl bg-white/45 dark:bg-black/20">
                          {sheet.previewImage ? (
                            <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <FallbackIcon className="h-9 w-9 text-gray-300 dark:text-gray-600" />
                          )}
                        </div>
                        <h3 className="truncate text-sm font-semibold">{sheet.title}</h3>
                        <p className="truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">{badge}</p>
                      </Link>
                    </div>
                  ) : (
                    <div key={sheet._id} className="glass-panel flex items-center gap-3 p-3">
                      <Link href={`/sheet/${sheet._id}`} className="flex min-w-0 flex-1 items-center gap-4">
                        <div className="flex h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-white/50 dark:bg-black/25">
                          {sheet.previewImage ? (
                            <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center">
                              <FallbackIcon className="h-5 w-5 text-gray-400" />
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold">{sheet.title}</h3>
                          <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">{badge}</p>
                        </div>
                      </Link>
                      {showMenu ? (
                        <div className="shrink-0" onClick={(e) => e.preventDefault()}>
                          <SheetCardMenu sheet={sheet} variant={menuVariant} orgRole={orgRole} {...sheetMenuBase} />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {segment === "drive" ? (
          <div className="mx-auto flex max-w-6xl flex-col gap-6">
            <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm">
              <span className="font-semibold text-gray-600 dark:text-gray-300">Personal storage</span>
              <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                {fmtStorage(personalStorage.used, personalStorage.quota)}
              </span>
            </div>

            <SortablePersonalFolders folders={filteredFolders} onOrderChange={setFolderOrder} />

            {filteredMine.length === 0 && !q.trim() ? (
              <EmptyDrive />
            ) : filteredMine.length === 0 ? (
              <p className="text-center text-sm text-gray-500">No notes match your search.</p>
            ) : q.trim() ? (
              <div
                className={
                  view === "grid"
                    ? "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
                    : "flex flex-col gap-2"
                }
              >
                <CreateSheetButton />
                {filteredMine.map((sheet) =>
                  view === "grid" ? (
                    <Link
                      key={sheet._id}
                      href={`/sheet/${sheet._id}`}
                      className="glass-panel flex aspect-[4/3] flex-col overflow-hidden p-4 transition-transform hover:scale-[1.01]"
                    >
                      <div className="mb-2 flex flex-1 items-center justify-center overflow-hidden rounded-2xl bg-white/45 dark:bg-black/20">
                        {sheet.previewImage ? (
                          <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Pencil className="h-9 w-9 text-gray-300 dark:text-gray-600" />
                        )}
                      </div>
                      <h3 className="truncate text-sm font-semibold">{sheet.title}</h3>
                    </Link>
                  ) : (
                    <Link key={sheet._id} href={`/sheet/${sheet._id}`} className="glass-panel flex items-center gap-4 p-3">
                      <div className="flex h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-white/50 dark:bg-black/25">
                        {sheet.previewImage ? (
                          <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center">
                            <Pencil className="h-5 w-5 text-gray-400" />
                          </span>
                        )}
                      </div>
                      <h3 className="min-w-0 flex-1 truncate font-semibold">{sheet.title}</h3>
                    </Link>
                  )
                )}
              </div>
            ) : (
              <SortableMyDriveSheets
                sheets={filteredMine}
                view={view}
                prepend={<CreateSheetButton />}
                onOrderChange={(next) => setMineOrder(next)}
                sheetMenu={sheetMenuBase ? { variant: "personal", ...sheetMenuBase } : undefined}
              />
            )}
          </div>
        ) : null}

        {segment === "shared" ? (
          <div className="mx-auto max-w-6xl space-y-4">
            <div className="flex gap-1 rounded-[1.25rem] bg-black/[0.04] p-1 dark:bg-white/[0.06]">
              <button
                type="button"
                onClick={() => setSharedSub("with")}
                className={`min-h-[44px] flex-1 rounded-[1rem] text-sm font-semibold ${
                  sharedSub === "with" ? "glass-panel shadow-sm" : "text-gray-500 dark:text-gray-400"
                }`}
              >
                Shared with me
              </button>
              <button
                type="button"
                onClick={() => setSharedSub("by")}
                className={`min-h-[44px] flex-1 rounded-[1rem] text-sm font-semibold ${
                  sharedSub === "by" ? "glass-panel shadow-sm" : "text-gray-500 dark:text-gray-400"
                }`}
              >
                Shared by me
              </button>
            </div>
            {sharedSub === "with" ? (
              filteredSharedWith.length === 0 ? (
                <EmptyShared />
              ) : (
                <div
                  className={
                    view === "grid"
                      ? "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
                      : "flex flex-col gap-2"
                  }
                >
                  {filteredSharedWith.map((sheet) =>
                    view === "grid" ? (
                      <Link
                        key={sheet._id}
                        href={`/sheet/${sheet._id}`}
                        className="glass-panel flex aspect-[4/3] flex-col overflow-hidden p-4 transition-transform hover:scale-[1.01] active:scale-[0.99]"
                      >
                        <div className="mb-2 flex flex-1 items-center justify-center overflow-hidden rounded-2xl bg-white/45 dark:bg-black/20">
                          {sheet.previewImage ? (
                            <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Share2 className="h-9 w-9 text-gray-300 dark:text-gray-600" />
                          )}
                        </div>
                        <h3 className="truncate text-sm font-semibold">{sheet.title}</h3>
                        <p className="text-[11px] font-semibold text-[var(--color-accent)]">Role: {sheet.role}</p>
                      </Link>
                    ) : (
                      <Link
                        key={sheet._id}
                        href={`/sheet/${sheet._id}`}
                        className="glass-panel flex items-center gap-4 p-3"
                      >
                        <div className="flex h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-white/50 dark:bg-black/25">
                          {sheet.previewImage ? (
                            <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center">
                              <Share2 className="h-5 w-5 text-gray-400" />
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold">{sheet.title}</h3>
                          <p className="text-xs font-medium text-[var(--color-accent)]">Role: {sheet.role}</p>
                        </div>
                      </Link>
                    )
                  )}
                </div>
              )
            ) : filteredSharedBy.length === 0 ? (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                Notes you have invited others to appear here.
              </p>
            ) : (
              <div
                className={
                  view === "grid"
                    ? "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
                    : "flex flex-col gap-2"
                }
              >
                {filteredSharedBy.map((sheet) =>
                  view === "grid" ? (
                    <div key={sheet._id} className="relative aspect-[4/3] min-h-0">
                      {sheetMenuBase ? (
                        <div className="absolute left-2 top-2 z-10" onClick={(e) => e.preventDefault()}>
                          <SheetCardMenu sheet={sheet} variant="sharedByMe" {...sheetMenuBase} />
                        </div>
                      ) : null}
                      <Link
                        href={`/sheet/${sheet._id}`}
                        className="glass-panel flex h-full flex-col overflow-hidden p-4 pt-11 shadow-sm transition-transform hover:scale-[1.01]"
                      >
                        <div className="mb-2 flex flex-1 items-center justify-center overflow-hidden rounded-2xl bg-white/45 dark:bg-black/20">
                          {sheet.previewImage ? (
                            <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Share2 className="h-9 w-9 text-gray-300 dark:text-gray-600" />
                          )}
                        </div>
                        <h3 className="truncate text-sm font-semibold">{sheet.title}</h3>
                      </Link>
                    </div>
                  ) : (
                    <div key={sheet._id} className="glass-panel flex items-center gap-3 p-3">
                      <Link href={`/sheet/${sheet._id}`} className="flex min-w-0 flex-1 items-center gap-4">
                        <div className="flex h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-white/50 dark:bg-black/25">
                          {sheet.previewImage ? (
                            <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Share2 className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                        <h3 className="min-w-0 flex-1 truncate font-semibold">{sheet.title}</h3>
                      </Link>
                      {sheetMenuBase ? (
                        <div className="shrink-0" onClick={(e) => e.preventDefault()}>
                          <SheetCardMenu sheet={sheet} variant="sharedByMe" {...sheetMenuBase} />
                        </div>
                      ) : null}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        ) : null}

        {segment === "trash" ? (
          <div className="mx-auto max-w-3xl space-y-8">
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              Items stay here until you restore them or delete forever.
            </p>
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">Folders</h2>
              {trashedFolders.length === 0 ? (
                <p className="text-sm text-gray-500">No folders in trash.</p>
              ) : (
                <ul className="space-y-2">
                  {trashedFolders.map((f) => (
                    <li key={f._id} className="glass-panel flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
                      <span className="min-w-0 truncate font-medium">{f.name}</span>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="rounded-xl bg-[var(--color-accent)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--color-accent)]"
                          onClick={() =>
                            void restoreFolderFromTrash(f._id)
                              .then(() => router.refresh())
                              .catch((e) => toastActionError(e, { id: "dash-restore-folder" }))
                          }
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          className="rounded-xl px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400"
                          onClick={() => {
                            if (confirm(`Permanently delete folder “${f.name}”?`)) {
                              void permanentlyDeleteFolder(f._id)
                                .then(() => router.refresh())
                                .catch((e) => toastActionError(e, { id: "dash-delete-folder" }));
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">Notes</h2>
              {trashedSheets.length === 0 ? (
                <p className="text-sm text-gray-500">No notes in trash.</p>
              ) : (
                <ul className="space-y-2">
                  {trashedSheets.map((s) => (
                    <li key={s._id} className="glass-panel flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
                      <span className="min-w-0 truncate font-medium">{s.title}</span>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="rounded-xl bg-[var(--color-accent)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--color-accent)]"
                          onClick={() =>
                            void restoreSheetFromTrash(s._id)
                              .then(() => router.refresh())
                              .catch((e) => toastActionError(e, { id: "dash-restore-sheet" }))
                          }
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          className="rounded-xl px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400"
                          onClick={() => {
                            if (confirm(`Permanently delete “${s.title}”?`)) {
                              void permanentlyDeleteSheet(s._id)
                                .then(() => router.refresh())
                                .catch((e) => toastActionError(e, { id: "dash-delete-sheet" }));
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}

        {segment === "orgs" ? (
          <div className="mx-auto flex max-w-6xl flex-col gap-5">
            {!userOwnsAnOrg ? (
              <div className="flex flex-wrap items-end gap-2">
                <input
                  value={newOrg}
                  onChange={(e) => setNewOrg(e.target.value)}
                  placeholder="Organization name"
                  className="min-h-[44px] min-w-[12rem] flex-1 rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-2.5 text-sm"
                />
                <button
                  type="button"
                  className="min-h-[44px] rounded-2xl bg-[var(--color-accent)] px-5 text-sm font-semibold text-white"
                  onClick={async () => {
                    try {
                      await createOrganization(newOrg);
                      setNewOrg("");
                      router.refresh();
                    } catch (e) {
                      toastActionError(e, { id: "dash-create-org" });
                    }
                  }}
                >
                  Create org
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                You already created an organization. You can still be a member of others you are invited to.
              </p>
            )}

            {orgs.length === 0 ? (
              <EmptyOrgs />
            ) : (
              <>
                <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm">
                  <span className="font-semibold text-gray-600 dark:text-gray-300">Org storage</span>
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                    {orgTab && orgStorageByOrg[orgTab]
                      ? fmtStorage(orgStorageByOrg[orgTab].used, orgStorageByOrg[orgTab].quota)
                      : "—"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {orgs.map((o) => (
                    <button
                      key={o._id}
                      type="button"
                      onClick={() => setOrgTab(o._id)}
                      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                        orgTab === o._id
                          ? "bg-[var(--color-accent)] text-white shadow-md"
                          : "glass text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      <Building2 className="h-4 w-4 shrink-0 opacity-90" />
                      {o.name}
                    </button>
                  ))}
                </div>
                {orgTab ? (
                  <div className="space-y-4">
                    <div className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Online now
                      </span>
                      {orgOnlineMembers.filter((m) => m.userId !== userId).length === 0 ? (
                        <span className="text-sm text-gray-500 dark:text-gray-400">No other members on this org workspace</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {orgOnlineMembers
                            .filter((m) => m.userId !== userId)
                            .map((m) => (
                              <div
                                key={m.userId}
                                title={m.name}
                                className="relative flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--input-bg)] py-1 pl-1 pr-3 shadow-sm"
                              >
                                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-[var(--bg-surface)]" />
                                <UserAvatar image={m.image} name={m.name} size="sm" className="!h-7 !w-7 !min-h-7 !min-w-7" />
                                <span className="max-w-[8rem] truncate text-xs font-semibold">{m.name}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                    <Link
                      href={`/dashboard/org/${orgTab}`}
                      className="glass-panel inline-flex min-h-[44px] items-center rounded-2xl px-5 py-2.5 text-sm font-semibold"
                    >
                      Manage members
                    </Link>
                    {filteredOrgSheets.length === 0 && q.trim() ? (
                      <p className="text-sm text-gray-500">No org notes match your search.</p>
                    ) : q.trim() ? (
                      <div
                        className={
                          view === "grid"
                            ? "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
                            : "flex flex-col gap-2"
                        }
                      >
                        <CreateSheetButton organizationId={orgTab} label="+ Org note" />
                        {filteredOrgSheets.map((sheet) => {
                          const live = orgDocBySheet[sheet._id];
                          return view === "grid" ? (
                            <Link
                              key={sheet._id}
                              href={`/sheet/${sheet._id}`}
                              className="glass-panel flex aspect-[4/3] flex-col overflow-hidden p-4"
                            >
                              <div className="mb-2 flex flex-1 items-center justify-center overflow-hidden rounded-2xl bg-white/45 dark:bg-black/20">
                                {sheet.previewImage ? (
                                  <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <Pencil className="h-9 w-9 text-gray-300" />
                                )}
                              </div>
                              <h3 className="truncate text-sm font-semibold">{sheet.title}</h3>
                              {live ? (
                                <p className="mt-1.5 flex min-h-0 items-center gap-1.5 text-[10px] font-semibold text-[var(--color-accent)]">
                                  <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--color-accent)]" />
                                  <span className="min-w-0 truncate">{live.name} is editing</span>
                                </p>
                              ) : null}
                            </Link>
                          ) : (
                            <Link key={sheet._id} href={`/sheet/${sheet._id}`} className="glass-panel flex items-center gap-4 p-3">
                              <div className="h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-white/50">
                                {sheet.previewImage ? (
                                  <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <Pencil className="m-auto block h-5 w-5 pt-4 text-gray-400" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h3 className="truncate font-semibold">{sheet.title}</h3>
                                {live ? (
                                  <p className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-[var(--color-accent)]">
                                    <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--color-accent)]" />
                                    <span className="truncate">{live.name} is editing</span>
                                  </p>
                                ) : null}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    ) : (
                      <OrgSheetsSortable
                        organizationId={orgTab}
                        sheets={filteredOrgSheets}
                        view={view}
                        prepend={<CreateSheetButton organizationId={orgTab} label="+ Org note" />}
                        onOrderChange={(next) => setOrgSheetOrder((prev) => ({ ...prev, [orgTab]: next }))}
                        currentUserId={userId}
                        orgRole={currentOrgRole}
                        inviterName={userDisplayName ?? userFirstName}
                        inviterImage={userImage ?? null}
                        editingBySheet={orgDocBySheet}
                      />
                    )}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </main>

      {folderModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setFolderModalOpen(false)} />
          <div className="glass-menu relative z-10 w-full max-w-sm rounded-[1.75rem] p-6 shadow-2xl">
            <h2 className="mb-3 text-lg font-bold">New folder</h2>
            <input
              value={folderModalName}
              onChange={(e) => setFolderModalName(e.target.value)}
              placeholder="Folder name"
              className="mb-4 w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => setFolderModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white"
                onClick={async () => {
                  if (!folderModalName.trim()) return;
                  setFolderCreating(true);
                  try {
                    await createFolder({ name: folderModalName, personal: true });
                    setFolderModalOpen(false);
                    router.refresh();
                  } catch (e) {
                    toastActionError(e, { id: "dash-create-folder" });
                  } finally {
                    setFolderCreating(false);
                  }
                }}
                disabled={folderCreating}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
