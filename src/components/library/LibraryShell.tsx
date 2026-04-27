"use client";

import { type DragEndEvent, type DragStartEvent, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { moveFolder as reparentFolder } from "@/lib/actions/folder";
import { getFolderSheets, moveSheetToFolder, reorderMyDriveSheets, reorderOrgSheets } from "@/lib/actions/sheet";
import { toastActionError } from "@/lib/client/actionFeedback";
import { readSheetVisits, type SheetVisitEntry, SHEET_VISIT_STORAGE_KEY } from "@/lib/client/sheetVisitLog";
import { dndIdNote, DND_ROOT_PERSONAL } from "./types";
import type { SheetCard, LibraryNode, DriveSort, ViewMode, SharedSub, FolderTreeEntry, OrgRow } from "./types";
import { toast } from "sonner";
import type { DocEditActivity, OnlineMember } from "@/components/realtime/OrgWorkspaceRealtime";
import type { DocPresenceMap } from "@/components/realtime/DocActivityRealtime";
import LibraryShellView from "./LibraryShellView";

type Ctx = { k: "sheet" | "folder" | "folderTree"; x: number; y: number; sheet?: SheetCard; folder?: FolderTreeEntry };

const RECENT_CAP = 40;

function recentKey(s: SheetCard, visits: Record<string, SheetVisitEntry>) {
  return Math.max(new Date(s.updatedAt).getTime(), visits[s._id]?.lastVisitMs ?? 0);
}

function useVisitLog() {
  const pathname = usePathname() ?? "";
  const [visitLog, setVisitLog] = useState<Record<string, SheetVisitEntry>>({});
  useEffect(() => {
    const sync = () => setVisitLog(readSheetVisits());
    sync();
    const st = (e: StorageEvent) => {
      if (e.key === null || e.key === SHEET_VISIT_STORAGE_KEY) sync();
    };
    window.addEventListener("storage", st);
    const ev = () => sync();
    window.addEventListener("tdraw:sheet-visit" as never, ev as never);
    return () => {
      window.removeEventListener("storage", st);
      window.removeEventListener("tdraw:sheet-visit" as never, ev as never);
    };
  }, [pathname]);
  return visitLog;
}

function parseDndId(s: string) {
  if (s === DND_ROOT_PERSONAL) return { kind: "rootPers" as const };
  if (s.startsWith("r-org-")) return { kind: "rootOrg" as const, orgId: s.slice(6) }; // "r-org-"
  if (s.startsWith("n:")) return { kind: "note" as const, id: s.slice(2) };
  if (s.startsWith("f:")) return { kind: "folder" as const, id: s.slice(2) };
  if (s.startsWith("df:")) return { kind: "dropF" as const, id: s.slice(3) };
  return { kind: "other" as const, raw: s };
}

export type LibraryShellProps = {
  userId: string;
  userFirstName: string;
  userDisplayName?: string;
  userImage?: string | null;
  mine: SheetCard[];
  rootDriveSheets: SheetCard[];
  homeSheets: SheetCard[];
  shared: (SheetCard & { role?: string })[];
  sharedByMe: SheetCard[];
  orgs: OrgRow[];
  orgSheetsByOrg: Record<string, SheetCard[]>;
  orgRootByOrg: Record<string, SheetCard[]>;
  personalFolderTree: FolderTreeEntry[];
  orgFolderTreeByOrg: Record<string, FolderTreeEntry[]>;
  trashedSheets: SheetCard[];
  trashedFolders: { _id: string; name: string }[];
  personalStorage: { used: number; quota: number };
  orgStorageByOrg: Record<string, { used: number; quota: number }>;
  initialFolderId: string | null;
  initialFolderSheets: SheetCard[] | null;
};

export default function LibraryShell(p: LibraryShellProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const sp = useSearchParams();
  const visits = useVisitLog();

  const [moreOpen, setMoreOpen] = useState(false);
  const [cmd, setCmd] = useState(false);

  const node = (sp.get("node") as LibraryNode) || "home";
  const org = sp.get("org");
  const sw = (sp.get("sw") as SharedSub) || "with";
  const folderQ = sp.get("folder");
  const qv = sp.get("q") || "";
  const sortP = (sp.get("sort") as DriveSort) || "updated";
  const view = (sp.get("v") as ViewMode) || "grid";
  const orgId =
    node === "org" && p.orgs.length > 0
      ? org && orgsHas(p.orgs, org)
        ? org
        : p.orgs[0]!._id
      : null;
  const folderId = folderQ || null;

  const setSp = useCallback(
    (patch: Record<string, string | null>) => {
      const u = new URL(typeof window === "undefined" ? "http://l/" : window.location.href);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) u.searchParams.delete(k);
        else u.searchParams.set(k, v);
      }
      router.replace(u.pathname + (u.search ? `?${u.searchParams.toString()}` : ""), { scroll: false });
      router.refresh();
    },
    [router]
  );

  const [fsSheets, setFsSheets] = useState<SheetCard[] | null>(p.initialFolderId === folderId && p.initialFolderSheets != null ? p.initialFolderSheets : null);
  const [reorder, setRootDrive] = useState(p.rootDriveSheets);
  const [reorderByOrg, setOBy] = useState(p.orgRootByOrg);
  const [mine, setMine] = useState(p.mine);
  const [pTree, setPtree] = useState(p.personalFolderTree);
  const [oTree, setOtree] = useState(p.orgFolderTreeByOrg);
  const [trashF, setTrashF] = useState(p.trashedFolders);
  const [folderCreate, setFolderCreate] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderCreateBusy, setFcb] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [infoId, setInfo] = useState<string | null>(null);
  const [shareId, setShare] = useState<string | null>(null);
  const [rename, setRen] = useState<string | null>(null);
  const [renameV, setRenV] = useState("");
  const [confirm, setC] = useState<null | { t: "sheet" | "folder"; id: string; n: string }>(null);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [activeDrag, setActive] = useState<SheetCard | null>(null);
  const [, setOrgOnline] = useState<OnlineMember[]>([]);
  const [, setOrgAct] = useState<Record<string, DocEditActivity | null>>({});
  const [docPresence, setDocPresence] = useState<DocPresenceMap>({});

  /* eslint-disable react-hooks/set-state-in-effect -- sync local state from server props and URL */
  useEffect(() => {
    setRootDrive(p.rootDriveSheets);
  }, [p.rootDriveSheets]);
  useEffect(() => {
    setOBy(p.orgRootByOrg);
  }, [p.orgRootByOrg]);
  useEffect(() => {
    setMine(p.mine);
  }, [p.mine]);
  useEffect(() => {
    setPtree(p.personalFolderTree);
  }, [p.personalFolderTree]);
  useEffect(() => {
    setOtree(p.orgFolderTreeByOrg);
  }, [p.orgFolderTreeByOrg]);
  useEffect(() => {
    setFsSheets(p.initialFolderId === folderId && p.initialFolderSheets != null ? p.initialFolderSheets : null);
  }, [p.initialFolderId, p.initialFolderSheets, folderId]);
  useEffect(() => {
    setTrashF(p.trashedFolders);
  }, [p.trashedFolders]);

  useEffect(() => {
    if (!folderId) {
      setFsSheets(null);
      return;
    }
    let a = true;
    void (async () => {
      try {
        const s = await getFolderSheets(folderId);
        if (a) setFsSheets(s);
      } catch (e) {
        if (a) toastActionError(e, { id: "get-folder" });
      }
    })();
    return () => {
      a = false;
    };
  }, [folderId, node, orgId]);

  useEffect(() => {
    const w = sp.get("newFolder") === "1";
    if (w) {
      setFolderCreate(true);
      setSp({ newFolder: null });
    }
  }, [sp, setSp]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const dndMode: "personal" | "org" | "none" =
    node === "drive" && !orgId && folderId == null
      ? "personal"
      : node === "org" && orgId
        ? "org"
        : "none";

  const showRootDrop = dndMode === "personal" || dndMode === "org";

  const homeRows = useMemo(() => {
    const all = new Map<string, SheetCard>();
    for (const s of mine) all.set(s._id, s);
    for (const list of Object.values(p.orgSheetsByOrg)) {
      for (const s of list) {
        if (!all.has(s._id)) all.set(s._id, s);
      }
    }
    for (const s of p.shared) {
      if (!all.has(s._id)) all.set(s._id, s);
    }
    for (const s of p.sharedByMe) {
      if (!all.has(s._id)) all.set(s._id, s);
    }
    const t = Array.from(all.values()).sort((a, b) => {
      if ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return recentKey(b, visits) - recentKey(a, visits);
    });
    return t.slice(0, RECENT_CAP);
  }, [mine, p.orgSheetsByOrg, p.shared, p.sharedByMe, visits]);

  const drNotes = useMemo(() => {
    if (node === "drive" && !orgId) {
      if (folderId) return (fsSheets ?? []).map((n) => dndIdNote(n._id));
      return reorder.map((n) => dndIdNote(n._id));
    }
    if (node === "org" && orgId) {
      if (folderId) return (fsSheets ?? []).map((n) => dndIdNote(n._id));
      return (reorderByOrg[orgId] ?? []).map((n) => dndIdNote(n._id));
    }
    return [] as string[];
  }, [node, orgId, folderId, fsSheets, reorder, reorderByOrg]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

  const onDragStartFull = (e: DragStartEvent) => {
    const id = String(e.active.id);
    if (id.startsWith("n:")) {
      const sid = id.slice(2);
      const list: SheetCard[] = folderId
        ? fsSheets ?? []
        : orgId
          ? reorderByOrg[orgId] ?? []
          : reorder;
      setActive(list.find((x) => x._id === sid) || null);
    } else {
      setActive(null);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const { active, over } = e;
    if (!over) return;
    const a = parseDndId(String(active.id));
    const o = parseDndId(String(over.id));

    if (a.kind === "note" && o.kind === "note" && a.id !== o.id) {
      if (dndMode === "personal" && !folderId) {
        const oi = drNotes.indexOf(dndIdNote(a.id));
        const oj = drNotes.indexOf(dndIdNote(o.id));
        if (oi < 0 || oj < 0) return;
        const next = arrayMove(reorder, oi, oj);
        setRootDrive(next);
        void reorderMyDriveSheets(next.map((n) => n._id))
          .then(() => router.refresh())
          .catch((err) => (toastActionError(err, { id: "r1" }), setRootDrive(p.rootDriveSheets)));
        return;
      }
      if (dndMode === "org" && orgId && !folderId) {
        const list = [...(reorderByOrg[orgId] ?? [])];
        const oi = list.findIndex((n) => n._id === a.id);
        const oj = list.findIndex((n) => n._id === o.id);
        if (oi < 0 || oj < 0) return;
        const next = arrayMove(list, oi, oj);
        setOBy((b) => ({ ...b, [orgId]: next }));
        void reorderOrgSheets(orgId, next.map((n) => n._id))
          .then(() => router.refresh())
          .catch((er) => (toastActionError(er, { id: "r2" }), setOBy(p.orgRootByOrg)));
        return;
      }
    }
    if (a.kind === "note") {
      let target: string | null = null;
      if (o.kind === "dropF") target = o.id;
      else if (o.kind === "rootPers" && dndMode === "personal") target = null;
      else if (o.kind === "rootOrg" && dndMode === "org" && orgId === o.orgId) target = null;
      if (a.kind === "note" && (o.kind === "dropF" || o.kind === "rootPers" || o.kind === "rootOrg")) {
        void (async () => {
          const ids = sel.size && selectMode && sel.has(a.id) ? Array.from(sel) : [a.id];
          for (const sid of ids) {
            try {
              await moveSheetToFolder(sid, target);
            } catch (err) {
              toastActionError(err, { id: "m1" });
              return;
            }
          }
          setSel(new Set());
          setSelectMode(false);
          router.refresh();
          toast("Moved", { action: { label: "Undo", onClick: () => ids.forEach((sid) => void moveSheetToFolder(sid, p.mine.find((m) => m._id === sid)?.folderId ?? null).then(() => router.refresh())) } });
        })();
        return;
      }
    }
    if (a.kind === "folder" && o.kind === "dropF" && a.id !== o.id) {
      void reparentFolder(a.id, o.id).then(() => router.refresh()).catch((e) => toastActionError(e, { id: "m2" }));
      return;
    }
    if (a.kind === "folder" && o.kind === "rootPers" && dndMode === "personal") {
      void reparentFolder(a.id, null).then(() => router.refresh()).catch((e) => toastActionError(e, { id: "m3" }));
      return;
    }
    if (a.kind === "folder" && o.kind === "rootOrg" && dndMode === "org" && orgId === o.orgId) {
      void reparentFolder(a.id, null).then(() => router.refresh()).catch((e) => toastActionError(e, { id: "m3b" }));
    }
  };

  useEffect(() => {
    const m = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "k") {
        ev.preventDefault();
        setCmd((c) => !c);
      }
    };
    window.addEventListener("keydown", m);
    return () => window.removeEventListener("keydown", m);
  }, []);

  return (
    <LibraryShellView
      p={p}
      node={node}
      orgId={orgId}
      sw={sw}
      folderId={folderId}
      qv={qv}
      sortP={sortP}
      view={view}
      router={router}
      pathname={pathname}
      moreOpen={moreOpen}
      setMoreOpen={setMoreOpen}
      setSp={setSp}
      visits={visits}
      homeRows={homeRows}
      reorder={reorder}
      reorderByOrg={reorderByOrg}
      fsSheets={fsSheets}
      pTree={pTree}
      oTree={oTree}
      curOrgTree={orgId ? oTree[orgId] ?? null : null}
      trashF={trashF}
      dndMode={dndMode}
      showRootDrop={showRootDrop}
      drNotes={drNotes}
      sensors={sensors}
      onDragStartFull={onDragStartFull}
      onDragEnd={onDragEnd}
      activeDrag={activeDrag}
      setActive={setActive}
      setRootDrive={setRootDrive}
      setOBy={setOBy}
      setSel={setSel}
      setSelectMode={setSelectMode}
      selectMode={selectMode}
      sel={sel}
      setCmd={setCmd}
      cmd={cmd}
      setFolderCreate={setFolderCreate}
      folderCreate={folderCreate}
      newFolderName={newFolderName}
      setNewFolderName={setNewFolderName}
      setFcb={setFcb}
      folderCreateBusy={folderCreateBusy}
      setInfo={setInfo}
      infoId={infoId}
      setShare={setShare}
      shareId={shareId}
      setRen={setRen}
      renameV={renameV}
      setRenV={setRenV}
      rename={rename}
      setC={setC}
      confirm={confirm}
      setCtx={setCtx}
      ctx={ctx}
      setOrgOnline={setOrgOnline}
      setOrgAct={setOrgAct}
      docPresence={docPresence}
      setDocPresence={setDocPresence}
    />
  );
}

function orgsHas(orgs: OrgRow[], o: string) {
  return orgs.some((x) => x._id === o);
}
