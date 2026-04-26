"use client";

import { DndContext, type DragEndEvent, type DragStartEvent, DragOverlay, closestCenter } from "@dnd-kit/core";
import type { ComponentProps } from "react";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import Link from "next/link";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckSquare, LayoutGrid, List, MoreHorizontal, Pencil, Search, Share2, Sparkles, UserRound } from "lucide-react";
import { createFolder, permanentlyDeleteFolder, restoreFolderFromTrash, renameFolder } from "@/lib/actions/folder";
import {
  createSheet,
  moveSheetToTrash,
  permanentlyDeleteSheet,
  restoreSheetFromTrash,
  bulkSetSheetPinned,
  bulkMoveSheetsToTrash,
} from "@/lib/actions/sheet";
import { toastActionError, toastActionSuccess } from "@/lib/client/actionFeedback";
import UserAvatar from "@/components/UserAvatar";
import ThemeToggle from "@/components/ThemeToggle";
import LogoutButton from "@/components/LogoutButton";
import LibrarySidebar from "./LibrarySidebar";
import SortableNoteCard from "./SortableNoteCard";
import FolderCard from "./FolderCard";
import MoveToSheet from "./MoveToSheet";
import CommandPalette from "./CommandPalette";
import InfoSheet from "./InfoSheet";
import SelectionBar from "./SelectionBar";
import SheetShareForm from "@/components/SheetShareForm";
import ConfirmDialog from "@/components/ConfirmDialog";
import { pathToFolder, toRows } from "./treeUtil";
import OrgWorkspaceRealtime, { type DocEditActivity, type OnlineMember } from "@/components/realtime/OrgWorkspaceRealtime";
import LibraryBreadcrumbs from "./Breadcrumbs";
import { DND_ROOT_ORG } from "./types";
import type { SheetCard, LibraryNode, DriveSort, ViewMode, SharedSub, FolderTreeEntry } from "./types";
import type { LibraryShellProps } from "./LibraryShell";

type Ctx = {
  k: "sheet" | "folder" | "folderTree";
  x: number;
  y: number;
  sheet?: SheetCard;
  folder?: FolderTreeEntry;
};

type LibraryShellViewProps = {
  p: LibraryShellProps;
  node: LibraryNode;
  orgId: string | null;
  sw: SharedSub;
  folderId: string | null;
  qv: string;
  sortP: DriveSort;
  view: ViewMode;
  router: AppRouterInstance;
  pathname: string;
  moreOpen: boolean;
  setMoreOpen: (v: boolean | ((a: boolean) => boolean)) => void;
  setSp: (patch: Record<string, string | null>) => void;
  visits: Record<string, import("@/lib/client/sheetVisitLog").SheetVisitEntry>;
  homeRows: SheetCard[];
  reorder: SheetCard[];
  reorderByOrg: Record<string, SheetCard[]>;
  fsSheets: SheetCard[] | null;
  pTree: FolderTreeEntry[];
  oTree: Record<string, FolderTreeEntry[]>;
  curOrgTree: FolderTreeEntry[] | null;
  trashF: { _id: string; name: string }[];
  dndMode: "personal" | "org" | "none";
  showRootDrop: boolean;
  drNotes: string[];
  sensors: NonNullable<ComponentProps<typeof DndContext>["sensors"]>;
  onDragStartFull: (e: DragStartEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  activeDrag: SheetCard | null;
  setActive: (s: SheetCard | null) => void;
  setRootDrive: (l: SheetCard[] | ((a: SheetCard[]) => SheetCard[])) => void;
  setOBy: (v: Record<string, SheetCard[]> | ((a: Record<string, SheetCard[]>) => Record<string, SheetCard[]>)) => void;
  setSel: (s: Set<string> | ((a: Set<string>) => Set<string>)) => void;
  setSelectMode: (v: boolean) => void;
  selectMode: boolean;
  sel: Set<string>;
  setCmd: (v: boolean) => void;
  cmd: boolean;
  setFolderCreate: (v: boolean) => void;
  folderCreate: boolean;
  newFolderName: string;
  setNewFolderName: (s: string) => void;
  setFcb: (v: boolean) => void;
  folderCreateBusy: boolean;
  setInfo: (s: string | null) => void;
  infoId: string | null;
  setShare: (s: string | null) => void;
  shareId: string | null;
  setRen: (s: string | null) => void;
  renameV: string;
  setRenV: (s: string) => void;
  rename: string | null;
  setC: (c: { t: "sheet" | "folder"; id: string; n: string } | null) => void;
  confirm: { t: "sheet" | "folder"; id: string; n: string } | null;
  setCtx: (c: Ctx | null) => void;
  ctx: Ctx | null;
  setOrgOnline: (m: OnlineMember[]) => void;
  setOrgAct: (a: Record<string, DocEditActivity | null>) => void;
};

function sortNotes<T extends { title: string; updatedAt: string; createdAt: string; pinned?: boolean }>(list: T[], sort: DriveSort) {
  const a = list.slice();
  a.sort((x, y) => {
    if ((y.pinned ? 1 : 0) - (x.pinned ? 1 : 0)) return (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0);
    if (sort === "alpha") return x.title.localeCompare(y.title);
    if (sort === "created") return new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime();
    return new Date(y.updatedAt).getTime() - new Date(x.updatedAt).getTime();
  });
  return a;
}

function filterQ<T extends { title: string }>(list: T[], q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return list;
  return list.filter((s) => s.title.toLowerCase().includes(t));
}

function filterNameQ<T extends { name: string }>(list: T[], q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return list;
  return list.filter((s) => s.name.toLowerCase().includes(t));
}

function sortFolders<T extends { name: string; updatedAt: string; pinned?: boolean }>(list: T[], sort: DriveSort) {
  const a = list.slice();
  a.sort((x, y) => {
    if ((y.pinned ? 1 : 0) - (x.pinned ? 1 : 0)) return (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0);
    if (sort === "alpha") return x.name.localeCompare(y.name);
    if (sort === "created") return new Date(y.updatedAt).getTime() - new Date(x.updatedAt).getTime();
    return new Date(y.updatedAt).getTime() - new Date(x.updatedAt).getTime();
  });
  return a;
}

export default function LibraryShellView(v: LibraryShellViewProps) {
  const p = v.p;
  const router = v.router;
  const { dndMode, showRootDrop, drNotes, sensors, onDragStartFull, onDragEnd, activeDrag } = v;
  const orgDndId = v.orgId ? DND_ROOT_ORG(v.orgId) : null;
  const [moveTo, setMoveTo] = useState<null | { itemKind: "sheet" | "folder"; sheetIds: string[] | null; movingFolderId: string | null }>(null);
  const [renFolder, setRenFolder] = useState<FolderTreeEntry | null>(null);
  const [renFolderV, setRenFolderV] = useState("");
  const [bulkTrashIds, setBulkTrash] = useState<string[] | null>(null);

  const pRows = useMemo(() => toRows(v.pTree), [v.pTree]);
  const orgRows = useMemo(() => (v.curOrgTree ? toRows(v.curOrgTree) : []), [v.curOrgTree]);
  const breadcrumbCrumbs = useMemo(() => {
    if (!v.folderId) return [] as { id: string; label: string }[];
    if (v.node === "org" && v.orgId) return pathToFolder(v.folderId, orgRows);
    if (v.node === "drive") return pathToFolder(v.folderId, pRows);
    return [];
  }, [v.folderId, v.node, v.orgId, orgRows, pRows]);

  const dndOn =
    (v.node === "drive" && !v.orgId) || (v.node === "org" && v.orgId);

  /* eslint-disable react-hooks/exhaustive-deps -- v.* props from parent LibraryShell; setters are stable */
  const closeMenu = useCallback(() => v.setMoreOpen(false), [v.setMoreOpen]);
  const closeCtx = useCallback(() => v.setCtx(null), [v.setCtx]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        v.setSelectMode(false);
        v.setSel(new Set());
        v.setCtx(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [v.setSelectMode, v.setSel, v.setCtx]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const onNoteContext = (e: React.MouseEvent, sheet: SheetCard) => {
    e.preventDefault();
    v.setCtx({ k: "sheet", x: e.clientX, y: e.clientY, sheet });
  };
  const onFolderContext = (e: React.MouseEvent, row: FolderTreeEntry) => {
    e.preventDefault();
    v.setCtx({ k: "folder", x: e.clientX, y: e.clientY, folder: row });
  };

  const handleSegmentLabel = useMemo(() => {
    if (v.node === "home") return "Home";
    if (v.node === "drive") return "My Drive";
    if (v.node === "shared") return "Shared";
    if (v.node === "trash") return "Trash";
    if (v.node === "org") {
      const o = p.orgs.find((x) => x._id === v.orgId);
      return o?.name ?? "Organization";
    }
    return "Library";
  }, [v.node, v.orgId, p.orgs]);

  const notesInView: SheetCard[] = useMemo(() => {
    if (v.node === "home") return v.homeRows;
    if (v.node === "drive" && v.orgId == null) {
      if (v.folderId) return v.fsSheets ?? [];
      return v.reorder;
    }
    if (v.node === "org" && v.orgId) {
      if (v.folderId) return v.fsSheets ?? [];
      return v.reorderByOrg[v.orgId] ?? [];
    }
    if (v.node === "shared") {
      return v.sw === "with" ? p.shared : p.sharedByMe;
    }
    if (v.node === "trash") return p.trashedSheets;
    return [];
  }, [p.shared, p.sharedByMe, p.trashedSheets, v.node, v.orgId, v.homeRows, v.reorder, v.reorderByOrg, v.fsSheets, v.folderId, v.sw]);

  const notesDis = useMemo(
    () => sortNotes(filterQ(notesInView, v.qv), v.sortP),
    [notesInView, v.qv, v.sortP]
  );

  const folderRoots: FolderTreeEntry[] = useMemo(() => {
    if (v.node === "drive" && !v.orgId && !v.folderId) return v.pTree.filter((f) => !f.parentFolderId);
    if (v.node === "org" && v.orgId && v.curOrgTree) return v.curOrgTree.filter((f) => !f.parentFolderId);
    if (v.node === "drive" && v.orgId == null && v.folderId) {
      return v.pTree.filter((f) => f.parentFolderId === v.folderId);
    }
    if (v.node === "org" && v.orgId && v.folderId) {
      return (v.curOrgTree ?? []).filter((f) => f.parentFolderId === v.folderId);
    }
    return [];
  }, [v.node, v.orgId, v.folderId, v.pTree, v.curOrgTree]);

  const folderRowsDis = useMemo(
    () => sortFolders(filterNameQ(folderRoots, v.qv), v.sortP),
    [folderRoots, v.qv, v.sortP]
  );

  const pinAllSelected = useMemo(() => {
    const ids = Array.from(v.sel);
    const sh = p.mine.filter((m) => ids.includes(m._id));
    if (sh.length === 0) return true;
    return sh.every((s) => s.pinned);
  }, [v.sel, p.mine]);

  const openMoveForSelection = () => {
    const arr = Array.from(v.sel);
    if (arr.length === 0) return;
    v.setSelectMode(false);
    setMoveTo({ itemKind: "sheet", sheetIds: arr, movingFolderId: null });
  };

  const isOwnSheet = (s: SheetCard) => s.userId == null || s.userId === p.userId;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-canvas)]">
      <OrgWorkspaceRealtime
        organizationId={v.node === "org" && v.orgId ? v.orgId : null}
        userName={p.userDisplayName ?? p.userFirstName}
        userImage={p.userImage}
        onOnlineChange={v.setOrgOnline}
        onDocActivity={v.setOrgAct}
      />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStartFull}
        onDragEnd={onDragEnd}
      >
        <div className="flex min-h-0 flex-1 gap-0 md:gap-4">
          <LibrarySidebar
            node={v.node}
            orgId={v.orgId}
            shared={v.sw}
            onPickNode={(n) => {
              if (n === "home") v.setSp({ node: "home", folder: null, org: null });
              else if (n === "trash") v.setSp({ node: "trash", folder: null, org: null });
              else if (n === "shared") v.setSp({ node: "shared", folder: null, org: null });
            }}
            onSetShared={(s) => v.setSp({ sw: s })}
            onOpenFolder={(id, ctx) => {
              if (ctx === "drive") v.setSp({ node: "drive", org: null, folder: id });
              else if (v.orgId) v.setSp({ node: "org", org: v.orgId, folder: id });
            }}
            personalTree={v.pTree}
            orgs={p.orgs}
            dndMode={dndMode}
            showRootDrop={showRootDrop}
            orgDndId={orgDndId}
            orgDndLabel="Drop to org root"
            onSelectOrg={(id) => v.setSp({ node: "org", org: id, folder: null })}
          />
          <main className="min-w-0 flex-1 md:pr-2">
            <header className="sticky top-0 z-40 pt-safe-top">
              <div className="glass-thick mx-3 mt-3 rounded-[1.75rem] px-4 py-4 shadow-[var(--shadow-float)] md:mx-6 md:rounded-[2rem] md:px-6 md:py-5">
                {/* Row 1: identity + global actions */}
                <div className="flex flex-wrap items-center gap-3 border-b border-white/10 pb-4 dark:border-white/[0.08]">
                  <UserAvatar
                    image={p.userImage}
                    name={p.userDisplayName ?? p.userFirstName}
                    size="lg"
                    className="shrink-0 ring-2 ring-black/5 dark:ring-white/10"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {handleSegmentLabel}
                    </p>
                    <h1 className="max-w-2xl truncate text-2xl font-bold tracking-tight text-[var(--color-text)] md:text-[28px]">Library</h1>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <ThemeToggle />
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => v.setMoreOpen((o) => !o)}
                        className="glass-panel flex h-11 w-11 items-center justify-center rounded-2xl touch-manipulation animate-micro hover:lift-sm active:scale-95"
                        aria-label="More"
                        aria-expanded={v.moreOpen}
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                      {v.moreOpen ? (
                        <>
                          <button
                            type="button"
                            className="fixed inset-0 z-[100] cursor-default bg-transparent"
                            aria-label="Close"
                            onClick={closeMenu}
                          />
                          <div className="glass-menu absolute right-0 top-12 z-[110] min-w-[12rem] overflow-hidden rounded-2xl py-2 shadow-xl">
                            <Link
                              href="/dashboard/tasks"
                              className="flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
                              onClick={closeMenu}
                            >
                              <CheckSquare className="h-4 w-4 opacity-70" />
                              Tasks
                            </Link>
                            <Link
                              href="/dashboard/calendar"
                              className="flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
                              onClick={closeMenu}
                            >
                              <CalendarDays className="h-4 w-4 opacity-70" />
                              Calendar
                            </Link>
                            <Link
                              href="/settings"
                              className="flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
                              onClick={closeMenu}
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
                </div>
                {/* Row 2: location */}
                <div className="mt-4 rounded-2xl bg-black/[0.03] px-3 py-2.5 dark:bg-white/[0.04]">
                  <LibraryBreadcrumbs
                    node={v.node}
                    crumbs={breadcrumbCrumbs}
                    onNavigate={(id) => v.setSp({ folder: id })}
                  />
                  <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">Hello, {p.userFirstName}</p>
                </div>
                {/* Row 3: toolbar — search vs layout vs create */}
                <div className="mt-4 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="relative min-w-0 w-full lg:max-w-md lg:flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
                    <input
                      className="input-field w-full min-h-10 rounded-2xl py-2 pl-10 pr-3 text-sm"
                      placeholder="Search in view"
                      value={v.qv}
                      onChange={(e) => v.setSp({ q: e.target.value || null })}
                    />
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/[0.02] px-1.5 py-1 dark:bg-white/[0.04]">
                      <span className="hidden pl-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:inline">Sort</span>
                      <select
                        className="input-field min-h-9 min-w-[7.5rem] rounded-lg border-0 bg-transparent py-1 text-xs"
                        value={v.sortP}
                        onChange={(e) => v.setSp({ sort: e.target.value as DriveSort })}
                        aria-label="Sort by"
                      >
                        <option value="updated">Updated</option>
                        <option value="created">Created</option>
                        <option value="alpha">Name</option>
                      </select>
                    </div>
                    <div
                      className="inline-flex shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/[0.02] dark:bg-white/[0.04]"
                      role="group"
                      aria-label="View layout"
                    >
                      <button
                        type="button"
                        className={`px-2.5 py-2 ${v.view === "grid" ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]" : "text-gray-500 hover:bg-black/5 dark:hover:bg-white/10"}`}
                        onClick={() => v.setSp({ v: "grid" })}
                        aria-pressed={v.view === "grid"}
                      >
                        <LayoutGrid className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className={`px-2.5 py-2 ${v.view === "list" ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]" : "text-gray-500 hover:bg-black/5 dark:hover:bg-white/10"}`}
                        onClick={() => v.setSp({ v: "list" })}
                        aria-pressed={v.view === "list"}
                      >
                        <List className="h-4 w-4" />
                      </button>
                    </div>
                    <span className="hidden h-8 w-px shrink-0 bg-white/10 sm:block" aria-hidden />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const id =
                              v.node === "org" && v.orgId
                                ? await createSheet({ organizationId: v.orgId, folderId: v.folderId ?? undefined })
                                : await createSheet({ folderId: v.folderId && (v.node === "drive" || (v.node === "org" && v.orgId)) ? v.folderId : undefined });
                            router.push(`/sheet/${id}`);
                          } catch (e) {
                            toastActionError(e, { id: "new-note" });
                          }
                        }}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--color-accent)] px-3 text-xs font-bold text-white"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        New note
                      </button>
                      {v.node === "drive" || (v.node === "org" && v.orgId) ? (
                        <button
                          type="button"
                          onClick={() => v.setSp({ newFolder: "1" })}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/20 bg-black/[0.03] px-3 text-xs font-bold dark:bg-white/[0.06]"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          New folder
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => v.setCmd(true)}
                        className="min-h-10 rounded-xl border border-dashed border-white/25 px-2.5 text-xs font-bold text-gray-500 md:hidden"
                      >
                        ⌘K
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </header>
            <div className="mx-3 flex min-h-0 flex-1 flex-col pb-28 pt-2 md:mx-6">
              {v.node === "home" ? (
                <section>
                  <h2 className="text-[10px] font-bold uppercase text-gray-500">Recent & pinned</h2>
                  <div
                    className={v.view === "grid" ? "mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4" : "mt-3 space-y-2"}
                  >
                    {notesDis.map((s) => (
                      <SortableNoteCard
                        key={s._id}
                        sheet={s}
                        view={v.view}
                        selected={v.sel.has(s._id)}
                        selectMode={v.selectMode}
                        dndEnabled={false}
                        onSelectToggle={(id) => {
                          v.setSelectMode(true);
                          v.setSel((prev) => {
                            const n = new Set(prev);
                            if (n.has(id)) n.delete(id);
                            else n.add(id);
                            return n;
                          });
                        }}
                        onContextMenu={onNoteContext}
                        sortable={false}
                      />
                    ))}
                  </div>
                </section>
              ) : v.node === "shared" ? (
                <section>
                  <div
                    className={v.view === "grid" ? "mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4" : "mt-1 space-y-2"}
                  >
                    {notesDis.map((s) => (
                      <SortableNoteCard
                        key={s._id}
                        sheet={s}
                        view={v.view}
                        selected={v.sel.has(s._id)}
                        selectMode={v.selectMode}
                        dndEnabled={false}
                        onSelectToggle={(id) => {
                          v.setSelectMode(true);
                          v.setSel((p0) => {
                            const n = new Set(p0);
                            if (n.has(id)) n.delete(id);
                            else n.add(id);
                            return n;
                          });
                        }}
                        onContextMenu={onNoteContext}
                        sortable={false}
                      />
                    ))}
                  </div>
                </section>
              ) : v.node === "trash" ? (
                <section>
                  <div
                    className={v.view === "grid" ? "grid grid-cols-2 gap-2 sm:grid-cols-3" : "space-y-2"}
                  >
                    {v.trashF.map((f) => (
                      <div
                        key={f._id}
                        className="glass-panel flex items-center justify-between gap-2 rounded-2xl p-3"
                      >
                        <span className="truncate text-sm font-semibold">📁 {f.name}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="text-xs text-[var(--color-accent)]"
                            onClick={() => void restoreFolderFromTrash(f._id).then(() => router.refresh())}
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            className="text-xs text-red-500"
                            onClick={() => v.setC({ t: "folder", id: f._id, n: f.name })}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                    {notesDis.map((s) => (
                      <div key={s._id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-sm font-medium">{s.title}</span>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="text-xs text-[var(--color-accent)]"
                            onClick={() => void restoreSheetFromTrash(s._id).then(() => router.refresh())}
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            className="text-xs text-red-500"
                            onClick={() => v.setC({ t: "sheet", id: s._id, n: s.title })}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : dndOn ? (
                <>
                  <div
                    className={v.view === "grid" ? "mt-1 grid grid-cols-2 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "mt-1 space-y-2"}
                  >
                    {folderRowsDis.map((row) => (
                      <FolderCard
                        key={row._id}
                        row={row}
                        view={v.view}
                        selected={false}
                        selectMode={false}
                        dndEnabled
                        onOpen={(id) =>
                          v.node === "org" && v.orgId
                            ? v.setSp({ node: "org", org: v.orgId, folder: id })
                            : v.setSp({ node: "drive", org: null, folder: id })
                        }
                        onSelectToggle={() => undefined}
                        onContextMenu={onFolderContext}
                        canDragFolder
                      />
                    ))}
                  </div>
                  <SortableContext id="lib-grid" items={drNotes} strategy={rectSortingStrategy}>
                    <div
                      className={v.view === "grid" ? "mt-1 grid grid-cols-2 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "mt-1 space-y-2"}
                    >
                      {notesDis.map((s) => (
                        <SortableNoteCard
                          key={s._id}
                          sheet={s}
                          view={v.view}
                          selected={v.sel.has(s._id)}
                          selectMode={v.selectMode}
                          dndEnabled
                          onSelectToggle={(id) => {
                            v.setSelectMode(true);
                            v.setSel((p0) => {
                              const n = new Set(p0);
                              if (n.has(id)) n.delete(id);
                              else n.add(id);
                              return n;
                            });
                          }}
                          onContextMenu={onNoteContext}
                          sortable
                        />
                      ))}
                    </div>
                  </SortableContext>
                </>
              ) : null}
            </div>
          </main>
        </div>
        <DragOverlay>
          {activeDrag ? (
            <div className="glass-thick w-32 rotate-2 scale-95 rounded-2xl p-2 text-xs font-bold shadow-xl">
              {activeDrag.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {v.sel.size > 0 && v.node !== "shared" && (v.node === "drive" || v.node === "org" || v.node === "home") ? (
        <SelectionBar
          count={v.sel.size}
          pinLabel={pinAllSelected ? "Unpin" : "Pin"}
          onMove={openMoveForSelection}
          onCancel={() => {
            v.setSel(new Set());
            v.setSelectMode(false);
          }}
          onPin={async () => {
            const arr = Array.from(v.sel);
            try {
              await bulkSetSheetPinned(arr, !pinAllSelected);
              toastActionSuccess("Updated pins");
            } catch (e) {
              toastActionError(e, { id: "bulk-pin" });
            }
            v.setSel(new Set());
            v.setSelectMode(false);
            router.refresh();
          }}
          onTrash={() => {
            setBulkTrash(Array.from(v.sel));
          }}
        />
      ) : null}
      <InfoSheet
        open={v.infoId != null}
        sheetId={v.infoId}
        onClose={() => v.setInfo(null)}
      />
      {v.shareId ? (
        <div className="fixed inset-0 z-200 flex flex-col items-center justify-center bg-black/55 p-4" role="dialog">
          <div className="absolute inset-0" aria-label="Close" onClick={() => v.setShare(null)} />
          <div className="relative z-10 w-full max-w-md overflow-y-auto">
            <button
              type="button"
              className="mb-2 rounded-xl bg-white/10 px-3 py-1 text-sm font-bold text-white"
              onClick={() => v.setShare(null)}
            >
              Close
            </button>
            <div className="max-h-[85vh] overflow-y-auto rounded-2xl bg-[var(--bg-elevated)] p-0 shadow-2xl">
              <SheetShareForm sheetId={v.shareId} inviterName={p.userDisplayName} inviterImage={p.userImage} />
            </div>
          </div>
        </div>
      ) : null}
      {v.ctx ? (
        <>
          <button type="button" className="fixed inset-0 z-[198] cursor-default bg-transparent" aria-label="Close menu" onClick={closeCtx} />
          <div
            className="glass-menu pointer-events-auto fixed z-[199] w-44 rounded-xl p-0 py-1"
            style={{ top: v.ctx.y, left: Math.min(v.ctx.x, (typeof window !== "undefined" ? window.innerWidth : 400) - 180) }}
            onClick={(e) => e.stopPropagation()}
            role="menu"
          >
          {v.ctx.k === "sheet" && v.ctx.sheet ? (
            <div>
              <Link href={`/sheet/${v.ctx.sheet._id}`} className="block w-full px-2 py-1.5 text-left text-sm" onClick={closeCtx}>
                Open
              </Link>
              {isOwnSheet(v.ctx.sheet) && v.node !== "trash" ? (
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-sm"
                  onClick={() => (setMoveTo({ itemKind: "sheet", sheetIds: [v.ctx!.sheet!._id], movingFolderId: null }), v.setCtx(null))}
                >
                  Move…
                </button>
              ) : null}
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-sm"
                onClick={() => (v.setInfo(v.ctx!.sheet!._id), v.setCtx(null))}
              >
                Information
              </button>
              {v.ctx.sheet.userId == null || v.ctx.sheet.userId === p.userId ? (
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-sm"
                  onClick={() => (v.setShare(v.ctx!.sheet!._id), v.setCtx(null))}
                >
                  <Share2 className="inline h-3 w-3" /> Share
                </button>
              ) : null}
              {v.node !== "trash" && isOwnSheet(v.ctx.sheet) ? (
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-sm text-red-500"
                  onClick={async () => {
                    const s = v.ctx!.sheet!;
                    v.setCtx(null);
                    try {
                      await moveSheetToTrash(s._id);
                      router.refresh();
                    } catch (e) {
                      toastActionError(e, { id: "to-trash" });
                    }
                  }}
                >
                  Move to trash
                </button>
              ) : null}
            </div>
          ) : v.ctx.k === "folder" && v.ctx.folder ? (
            <div>
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-sm"
                onClick={() => {
                  const f = v.ctx!.folder!._id;
                  if (v.node === "org" && v.orgId) v.setSp({ node: "org", org: v.orgId, folder: f });
                  else v.setSp({ node: "drive", org: null, folder: f });
                  v.setCtx(null);
                }}
              >
                Open
              </button>
              {v.node !== "trash" && v.node !== "shared" ? (
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-sm"
                  onClick={() => (setMoveTo({ itemKind: "folder", sheetIds: null, movingFolderId: v.ctx!.folder!._id }), v.setCtx(null))}
                >
                  Move…
                </button>
              ) : null}
              {v.node !== "trash" ? (
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-sm"
                  onClick={() => (setRenFolder(v.ctx!.folder!), setRenFolderV(v.ctx!.folder!.name), v.setCtx(null))}
                >
                  Rename
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        </>
      ) : null}
      <CommandPalette
        open={v.cmd}
        onClose={() => v.setCmd(false)}
        onNavigate={() => void 0}
        orgs={p.orgs}
        hasSelection={v.sel.size > 0}
        onOpenMove={openMoveForSelection}
      />
      <MoveToSheet
        open={moveTo != null}
        onClose={() => setMoveTo(null)}
        onDone={() => router.refresh()}
        title="Move to…"
        mode={v.orgId && v.node === "org" ? "org" : "personal"}
        organizationId={v.orgId}
        currentFolderId={
          moveTo?.sheetIds?.[0]
            ? p.mine.find((m) => m._id === moveTo.sheetIds![0])?.folderId ?? p.orgSheetsByOrg[v.orgId ?? ""]?.find((m) => m._id === moveTo.sheetIds![0])?.folderId ?? v.folderId
            : v.folderId
        }
        itemKind={moveTo?.itemKind}
        movingSheetIds={moveTo?.sheetIds ?? null}
        movingFolderId={moveTo?.movingFolderId ?? null}
      />
      <ConfirmDialog
        open={v.confirm != null}
        title="Permanently delete"
        description={v.confirm ? `“${v.confirm.n}” will be gone forever.` : ""}
        confirmLabel="Delete"
        tone="danger"
        onClose={() => v.setC(null)}
        onConfirm={async () => {
          if (!v.confirm) return;
          if (v.confirm.t === "sheet") await permanentlyDeleteSheet(v.confirm.id);
          else await permanentlyDeleteFolder(v.confirm.id);
          v.setC(null);
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={bulkTrashIds != null}
        title="Move to trash"
        description={bulkTrashIds ? `Move ${bulkTrashIds.length} note(s) to trash?` : ""}
        confirmLabel="Move to trash"
        tone="danger"
        onClose={() => setBulkTrash(null)}
        onConfirm={async () => {
          if (!bulkTrashIds?.length) return;
          await bulkMoveSheetsToTrash(bulkTrashIds);
          v.setSel(new Set());
          v.setSelectMode(false);
          router.refresh();
        }}
      />
      {v.folderCreate ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4" role="dialog">
          <div className="glass-menu w-full max-w-sm rounded-2xl p-4">
            <h3 className="text-lg font-bold">New folder</h3>
            <input
              className="input-field mt-3 w-full rounded-xl px-3 py-2"
              value={v.newFolderName}
              onChange={(e) => v.setNewFolderName(e.target.value)}
              placeholder="Name"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="px-3 py-1" onClick={() => v.setFolderCreate(false)} disabled={v.folderCreateBusy}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-[var(--color-accent)] px-3 py-1.5 text-white"
                disabled={!v.newFolderName.trim() || v.folderCreateBusy}
                onClick={async () => {
                  v.setFcb(true);
                  try {
                    if (v.node === "org" && v.orgId) {
                      await createFolder({ name: v.newFolderName, parentFolderId: v.folderId ?? null, organizationId: v.orgId });
                    } else {
                      await createFolder({ name: v.newFolderName, personal: true, parentFolderId: v.folderId ?? null });
                    }
                    v.setFolderCreate(false);
                    v.setNewFolderName("");
                    router.refresh();
                  } catch (e) {
                    toastActionError(e, { id: "nf" });
                  } finally {
                    v.setFcb(false);
                  }
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {renFolder ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4">
          <div className="glass-menu w-full max-w-sm rounded-2xl p-4">
            <h3 className="text-lg font-bold">Rename folder</h3>
            <input
              className="input-field mt-3 w-full"
              value={renFolderV}
              onChange={(e) => setRenFolderV(e.target.value)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => (setRenFolder(null), setRenFolderV(""))}>
                Cancel
              </button>
              <button
                type="button"
                className="bg-[var(--color-accent)] px-3 text-white"
                onClick={async () => {
                  try {
                    await renameFolder(renFolder._id, renFolderV);
                    setRenFolder(null);
                    router.refresh();
                  } catch (e) {
                    toastActionError(e, { id: "rnf" });
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
