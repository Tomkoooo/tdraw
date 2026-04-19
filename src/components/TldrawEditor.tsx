"use client";

import { Tldraw, Editor, loadSnapshot, getSnapshot } from "tldraw";
import type { TLStateNodeConstructor } from "@tldraw/editor";
import "tldraw/tldraw.css";
import { saveSheetState, updateSheetTitle } from "@/lib/actions/sheet";
import { getRealtimeToken } from "@/lib/actions/socketToken";
import { importPdfToEditor } from "@/lib/pdf/importPdfToEditor";
import { exportEditorToPdf } from "@/lib/pdf/exportEditorToPdf";
import { toolsForHotbarPreference } from "@/lib/tldraw/toolRegistry";
import SheetShareForm from "@/components/SheetShareForm";
import { useCalculator } from "@/context/CalculatorContext";
import CanvasShareSheet from "@/components/canvas/CanvasShareSheet";
import UserAvatar from "@/components/UserAvatar";
import OrgWorkspaceRealtime, { type OnlineMember } from "@/components/realtime/OrgWorkspaceRealtime";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  FileDown,
  FileUp,
  Loader2,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import localforage from "localforage";

interface TldrawEditorProps {
  sheetId: string;
  initialData: unknown;
  title: string;
  canWrite: boolean;
  canTitle: boolean;
  contentVersion: number;
  hotbarToolIds: string[];
  userName?: string | null;
  userImage?: string | null;
  /** Current user id — used to ignore own realtime snapshot echoes. */
  userId?: string;
  /** When set, subscribe to org presence (who is online in the org workspace). */
  organizationId?: string | null;
  showSharePanel?: boolean;
}

type BusyKind = "import" | "export";

type RemoteCursor = { userId: string; name: string; color: string; pageId?: string; x: number; y: number };

const queueKey = (id: string) => `tdraw-save-queue-${id}`;

export default function TldrawEditor({
  sheetId,
  initialData,
  title: initialTitle,
  canWrite,
  canTitle,
  contentVersion: initialVersion,
  hotbarToolIds,
  userName,
  userImage,
  userId,
  organizationId = null,
  showSharePanel = true,
}: TldrawEditorProps) {
  const router = useRouter();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [shareOpen, setShareOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const { setOpen: setGlobalCalcOpen } = useCalculator();
  const [screenCursors, setScreenCursors] = useState<
    Record<string, { sx: number; sy: number; name: string; color: string }>
  >({});

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockSaveRef = useRef(false);
  const editorRef = useRef<Editor | null>(null);
  const versionRef = useRef(initialVersion);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [busy, setBusy] = useState<BusyKind | null>(null);
  const busyRef = useRef<BusyKind | null>(null);
  const [pageTick, setPageTick] = useState(0);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
  const [roomMembers, setRoomMembers] = useState<Record<string, { name: string; color: string; image?: string }>>({});
  const [orgOnline, setOrgOnline] = useState<OnlineMember[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const remoteCursorsRef = useRef<Record<string, RemoteCursor>>({});

  useEffect(() => {
    remoteCursorsRef.current = remoteCursors;
  }, [remoteCursors]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const hotbarTools = useMemo(() => toolsForHotbarPreference(hotbarToolIds), [hotbarToolIds]);

  const noopDocActivity = useCallback(() => {}, []);

  const presenceStrip = useMemo(() => {
    const map = new Map<string, { name: string; color: string; image?: string }>();
    for (const [k, v] of Object.entries(roomMembers)) map.set(k, v);
    for (const [k, c] of Object.entries(remoteCursors)) {
      if (!map.has(k)) map.set(k, { name: c.name, color: c.color });
    }
    return [...map.entries()].filter(([id]) => !userId || id !== userId);
  }, [roomMembers, remoteCursors, userId]);

  const userColor = useMemo(() => {
    const palette = ["#0071E3", "#34C759", "#FF9500", "#AF52DE", "#FF2D55"];
    let h = 0;
    for (let i = 0; i < (sheetId || "").length; i++) h = (h + sheetId.charCodeAt(i) * 17) % 997;
    return palette[h % palette.length];
  }, [sheetId]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    return editor.store.listen(
      () => {
        setPageTick((n) => n + 1);
      },
      { source: "all", scope: "all" }
    );
  }, [editor]);

  /** Single handler: chrome fade on canvas, long-press calculator on select/hand; skips modals and import/export. */
  useEffect(() => {
    let moveListener: ((ev: PointerEvent) => void) | null = null;

    const clearLongPress = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (moveListener) {
        window.removeEventListener("pointermove", moveListener, true);
        moveListener = null;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return;
      if (busyRef.current) return;
      const t = e.target as HTMLElement;
      if (t.closest("[data-sheet-chrome]") || t.closest("[data-canvas-share-root]") || t.closest("[data-sheet-busy]"))
        return;

      const onTlCanvas = t.closest?.(".tl-canvas");
      const onTlBg = t.closest?.(".tl-background");
      if (!onTlCanvas && !onTlBg) return;

      if (onTlCanvas) setChromeHidden(true);

      const ed = editorRef.current;
      const tool = ed?.getCurrentToolId() ?? "";
      if ((onTlCanvas || onTlBg) && (tool === "select" || tool === "hand")) {
        clearLongPress();
        const sx = e.clientX;
        const sy = e.clientY;
        moveListener = (ev: PointerEvent) => {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 14) clearLongPress();
        };
        window.addEventListener("pointermove", moveListener, true);
        longPressTimer.current = setTimeout(() => {
          clearLongPress();
          setGlobalCalcOpen(true);
        }, 520);
      }
    };

    const onPointerUp = () => {
      clearLongPress();
      window.setTimeout(() => setChromeHidden(false), 280);
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);
    return () => {
      clearLongPress();
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
    };
  }, [setGlobalCalcOpen]);

  useEffect(() => {
    if (!editor) return;
    const ed = editor;
    const tick = () => {
      const cur = ed.getCurrentPageId();
      const next: Record<string, { sx: number; sy: number; name: string; color: string }> = {};
      for (const [uid, c] of Object.entries(remoteCursorsRef.current)) {
        if (userId && uid === userId) continue;
        if (typeof c.x !== "number" || typeof c.y !== "number") continue;
        if (c.pageId && c.pageId !== cur) continue;
        try {
          const p = ed.pageToScreen({ x: c.x, y: c.y });
          next[uid] = { sx: p.x, sy: p.y, name: c.name, color: c.color };
        } catch {
          /* viewport not ready */
        }
      }
      setScreenCursors(next);
    };
    tick();
    ed.on("tick", tick);
    return () => {
      ed.off("tick", tick);
    };
  }, [editor, userId]);

  useEffect(() => {
    let socket: Socket | null = null;

    async function connect() {
      try {
        const cfg = await fetch("/api/realtime-config").then((r) => r.json());
        const raw = typeof cfg.url === "string" ? cfg.url.trim() : "";
        const url = raw.length > 0 ? raw : undefined;

        const { token } = await getRealtimeToken();
        const opts = {
          transports: ["websocket", "polling"] as string[],
          auth: {
            token,
            name: userName || "Guest",
            color: userColor,
            image: typeof userImage === "string" ? userImage : "",
          },
        };
        socket = url ? io(url, opts) : io(opts);
        socketRef.current = socket;

        socket.emit("joinSheet", sheetId, () => {});

        socket.on("sheet:snapshot", ({ snapshot, contentVersion, fromUserId }) => {
          if (userId && fromUserId === userId) return;
          if (typeof contentVersion === "number" && contentVersion > versionRef.current) {
            const ed = editorRef.current;
            if (ed) {
              try {
                blockSaveRef.current = true;
                loadSnapshot(ed.store, snapshot);
                versionRef.current = contentVersion;
              } catch (err) {
                console.error(err);
              } finally {
                blockSaveRef.current = false;
              }
            }
          }
        });

        socket.on("presence:cursor", (payload: RemoteCursor) => {
          if (!payload?.userId) return;
          setRemoteCursors((prev) => ({ ...prev, [payload.userId]: payload }));
        });

        socket.on(
          "presence:list",
          (payload: {
            userId?: string;
            name?: string;
            color?: string;
            image?: string;
            joined?: boolean;
            left?: boolean;
          }) => {
            if (!payload?.userId) return;
            if (payload.left) {
              setRemoteCursors((prev) => {
                const n = { ...prev };
                delete n[payload.userId!];
                return n;
              });
              setRoomMembers((prev) => {
                const n = { ...prev };
                delete n[payload.userId!];
                return n;
              });
              return;
            }
            if (payload.joined) {
              if (userId && payload.userId === userId) return;
              setRoomMembers((prev) => ({
                ...prev,
                [payload.userId!]: {
                  name: payload.name ?? "User",
                  color: payload.color ?? "#0071E3",
                  image: typeof payload.image === "string" && payload.image.length > 0 ? payload.image : undefined,
                },
              }));
            }
          }
        );
      } catch (e) {
        console.warn("realtime connect skipped", e);
      }
    }

    void connect();
    return () => {
      setRoomMembers({});
      socket?.emit("leaveSheet", sheetId);
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [sheetId, userColor, userName, userId, userImage]);

  const pageNav = useMemo(() => {
    void pageTick;
    if (!editor) return { index: 1, total: 1, name: "" };
    const pages = editor.getPages();
    const id = editor.getCurrentPageId();
    const idx = pages.findIndex((p) => p.id === id);
    const safeIdx = idx >= 0 ? idx : 0;
    return {
      index: safeIdx + 1,
      total: Math.max(1, pages.length),
      name: pages[safeIdx]?.name ?? "",
    };
  }, [editor, pageTick]);

  const persistTitle = useCallback(
    async (next: string) => {
      if (!canTitle) return;
      try {
        await updateSheetTitle(sheetId, next);
        router.refresh();
      } catch (e) {
        console.error(e);
      }
    },
    [sheetId, router, canTitle]
  );

  const onTitleChange = (value: string) => {
    if (!canTitle) return;
    setTitle(value);
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    titleSaveTimer.current = setTimeout(() => {
      persistTitle(value);
    }, 600);
  };

  const flushTitle = useCallback(() => {
    if (titleSaveTimer.current) {
      clearTimeout(titleSaveTimer.current);
      titleSaveTimer.current = null;
    }
    void persistTitle(title);
  }, [persistTitle, title]);

  const flushCanvasSave = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed || blockSaveRef.current || !canWrite) return;
    try {
      const snapshot = getSnapshot(ed.store);
      const res = await saveSheetState(sheetId, snapshot, undefined, versionRef.current);
      if ("conflict" in res && res.conflict) {
        console.warn("save conflict — refresh recommended");
        return;
      }
      if ("contentVersion" in res && typeof res.contentVersion === "number") {
        versionRef.current = res.contentVersion;
      }
      const sk = socketRef.current;
      if (sk?.connected) {
        sk.emit("sheet:snapshot", { sheetId, snapshot, contentVersion: versionRef.current });
      }
    } catch (e) {
      console.error(e);
      try {
        const snapshot = getSnapshot(ed.store);
        const q = ((await localforage.getItem<unknown[]>(queueKey(sheetId))) ?? []) as unknown[];
        q.push({ snapshot, at: Date.now(), v: versionRef.current });
        await localforage.setItem(queueKey(sheetId), q);
      } catch {
        /* offline queue best-effort */
      }
    }
  }, [sheetId, canWrite]);

  const handleMount = useCallback(
    (ed: Editor) => {
      setEditor(ed);
      editorRef.current = ed;

      if (!canWrite) {
        try {
          const inst = ed.getInstanceState();
          ed.store.put([{ ...inst, isReadonly: true }]);
        } catch {
          /* readonly flag best-effort */
        }
      }

      if (initialData && Object.keys(initialData).length > 0) {
        try {
          loadSnapshot(ed.store, initialData);
        } catch (e) {
          console.error("Failed to load initial data", e);
        }
      }

      let debounceTimer: ReturnType<typeof setTimeout>;
      if (canWrite) {
        ed.store.listen(
          () => {
            if (blockSaveRef.current) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              if (blockSaveRef.current) return;
              void flushCanvasSave();
            }, 1500);
          },
          { source: "user", scope: "document" }
        );
      }
    },
    [initialData, canWrite, flushCanvasSave]
  );

  useEffect(() => {
    if (!editor) return;
    const ed = editor;
    const sendCursor = () => {
      const sk = socketRef.current;
      if (!sk?.connected) return;
      const pageId = ed.getCurrentPageId();
      const vb = ed.getViewportPageBounds();
      if (!vb) return;
      const center = { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
      sk.emit("presence:cursor", { sheetId, pageId, x: center.x, y: center.y });
    };
    const iv = setInterval(sendCursor, 1200);
    ed.on("tick", sendCursor);
    return () => {
      clearInterval(iv);
      ed.off("tick", sendCursor);
    };
  }, [editor, sheetId]);

  useEffect(() => {
    const run = async () => {
      const q = ((await localforage.getItem<unknown[]>(queueKey(sheetId))) ?? []) as unknown[];
      if (!q.length || !canWrite) return;
      const ed = editorRef.current;
      if (!ed) return;
      const next = [...q];
      const item = next[0] as { snapshot?: unknown; v?: number } | undefined;
      if (!item?.snapshot) return;
      try {
        const res = await saveSheetState(sheetId, item.snapshot, undefined, item.v ?? versionRef.current);
        if ("contentVersion" in res && typeof res.contentVersion === "number") {
          versionRef.current = res.contentVersion;
        }
        next.shift();
        await localforage.setItem(queueKey(sheetId), next);
      } catch {
        /* still offline */
      }
    };
    void run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [sheetId, canWrite]);

  const goPage = (delta: -1 | 1) => {
    if (!editor) return;
    const pages = editor.getPages();
    if (pages.length <= 1) return;
    const id = editor.getCurrentPageId();
    const idx = pages.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const nextIdx = Math.min(pages.length - 1, Math.max(0, idx + delta));
    if (nextIdx !== idx) {
      editor.setCurrentPage(pages[nextIdx]!.id);
      setPageTick((n) => n + 1);
    }
  };

  const onPickPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor || !canWrite) return;
    blockSaveRef.current = true;
    setBusy("import");
    try {
      await importPdfToEditor(editor, file);
    } catch (err) {
      console.error(err);
    } finally {
      blockSaveRef.current = false;
      setBusy(null);
      await flushCanvasSave();
    }
  };

  const onExportPdf = async () => {
    if (!editor) return;
    blockSaveRef.current = true;
    setBusy("export");
    try {
      await exportEditorToPdf(editor, title || "note");
    } catch (err) {
      console.error(err);
    } finally {
      blockSaveRef.current = false;
      setBusy(null);
    }
  };

  const busyLabel =
    busy === "import" ? "Importing PDF…" : busy === "export" ? "Exporting PDF…" : "";

  const chromeClass = `pointer-events-auto transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
    chromeHidden ? "translate-y-1 opacity-[0.15] max-md:pointer-events-none" : "opacity-100"
  }`;

  return (
    <div className="fixed inset-0 flex min-h-0 h-full w-full flex-col overscroll-none bg-[var(--bg-canvas)] pt-safe-top pb-safe-bottom">
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        disabled={busy !== null || !canWrite}
        onChange={onPickPdf}
      />

      <div className="relative z-0 isolate min-h-0 w-full min-w-0 flex-1">
        <Tldraw
          onMount={handleMount}
          inferDarkMode
          className="h-full min-h-0 w-full"
          {...(hotbarTools ? { tools: hotbarTools as TLStateNodeConstructor[] } : {})}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10">
        {presenceStrip.length > 0 ? (
          <div className="pointer-events-auto absolute left-0 right-0 top-[max(0.5rem,env(safe-area-inset-top))] z-[55] flex justify-center px-4">
            <div className="glass-thick flex max-w-[min(100%,36rem)] items-center gap-2 overflow-x-auto rounded-full px-3 py-2">
              {presenceStrip.map(([uid, meta]) => (
                <div
                  key={uid}
                  className="flex shrink-0 items-center gap-2 rounded-full bg-black/5 py-1 pl-1 pr-3 dark:bg-white/10"
                  title={meta.name}
                >
                  {meta.image ? (
                    <UserAvatar image={meta.image} name={meta.name} size="sm" />
                  ) : (
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-inner"
                      style={{ backgroundColor: meta.color }}
                    >
                      {meta.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="max-w-[8rem] truncate text-xs font-semibold text-gray-800 dark:text-gray-100">
                    {meta.name}
                  </span>
                </div>
              ))}
              <span className="hidden pl-1 text-[11px] font-medium text-gray-500 sm:inline">on this note</span>
            </div>
          </div>
        ) : null}

        {Object.entries(screenCursors).map(([uid, p]) => (
          <div
            key={uid}
            className="pointer-events-none absolute z-[50] h-3.5 w-3.5 rounded-full border-2 border-white shadow-md"
            style={{
              left: p.sx,
              top: p.sy,
              transform: "translate(-50%, -50%)",
              background: p.color,
            }}
            title={p.name}
          />
        ))}

        <div
          data-sheet-chrome
          className={`pointer-events-auto absolute left-3 right-3 top-[max(3.5rem,env(safe-area-inset-top))] z-[56] md:left-6 md:right-auto md:max-w-[min(calc(100vw-3rem),26rem)] ${chromeClass}`}
        >
          <div className="glass-thick flex flex-col gap-2 rounded-[1.5rem] px-2 py-2 md:rounded-[1.75rem] md:px-3">
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="flex shrink-0 items-center justify-center rounded-2xl p-3 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <ChevronLeft className="h-6 w-6 text-[var(--color-text)]" />
              </Link>
              <input
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                onBlur={flushTitle}
                readOnly={!canTitle}
                className="min-w-0 flex-1 rounded-2xl border border-transparent bg-transparent px-3 py-2 text-[15px] font-semibold tracking-tight text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]/35 read-only:opacity-75"
                aria-label="Note title"
                spellCheck={false}
              />
            </div>
            {pageNav.total > 1 ? (
              <div className="flex items-center justify-center gap-1 border-t border-[var(--glass-border)] pt-2">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={pageNav.index <= 1 || busy !== null}
                  onClick={() => goPage(-1)}
                  className="rounded-xl p-2 text-gray-800 transition-colors hover:bg-black/10 disabled:opacity-35 dark:text-gray-100 dark:hover:bg-white/10"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-[6.5rem] px-2 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Page {pageNav.index} / {pageNav.total}
                  </div>
                  {pageNav.name ? (
                    <div className="max-w-[11rem] truncate text-[11px] font-medium text-gray-800 dark:text-gray-100">
                      {pageNav.name}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={pageNav.index >= pageNav.total || busy !== null}
                  onClick={() => goPage(1)}
                  className="rounded-xl p-2 text-gray-800 transition-colors hover:bg-black/10 disabled:opacity-35 dark:text-gray-100 dark:hover:bg-white/10"
                >
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-1 border-t border-[var(--glass-border)] pt-2">
              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                disabled={busy !== null || !canWrite}
                className="rounded-2xl p-3 hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
                aria-label="Import PDF"
              >
                <FileUp className="h-5 w-5 text-[var(--color-text)]" />
              </button>
              <button
                type="button"
                onClick={() => void onExportPdf()}
                disabled={busy !== null}
                className="rounded-2xl p-3 hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
                aria-label="Export PDF"
              >
                <FileDown className="h-5 w-5 text-[var(--color-text)]" />
              </button>
              {showSharePanel ? (
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  className="rounded-2xl p-3 hover:bg-black/5 dark:hover:bg-white/10"
                  aria-label="Share"
                >
                  <Users className="h-5 w-5 text-[var(--color-text)]" />
                </button>
              ) : null}
              <Link
                href="/settings"
                className="rounded-2xl p-3 hover:bg-black/5 dark:hover:bg-white/10"
                aria-label="Settings"
              >
                <Settings className="h-5 w-5 text-[var(--color-text)]" />
              </Link>
            </div>
          </div>
        </div>

        {organizationId ? (
          <OrgWorkspaceRealtime
            organizationId={organizationId}
            userName={userName || "User"}
            userImage={userImage}
            onOnlineChange={setOrgOnline}
            onDocActivity={noopDocActivity}
          />
        ) : null}
        {organizationId && orgOnline.filter((m) => !userId || m.userId !== userId).length > 0 ? (
          <div className="pointer-events-auto absolute left-3 right-3 top-[calc(env(safe-area-inset-top)+10.5rem)] z-[54] flex justify-center px-2 md:left-6 md:justify-start">
            <div className="glass-panel flex max-w-full items-center gap-2 overflow-x-auto rounded-full px-3 py-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
              <span className="shrink-0 uppercase tracking-wide text-gray-500">Org online</span>
              <div className="flex shrink-0 items-center -space-x-2">
                {orgOnline
                  .filter((m) => !userId || m.userId !== userId)
                  .slice(0, 8)
                  .map((m) => (
                    <UserAvatar key={m.userId} image={m.image} name={m.name} size="sm" className="ring-2 ring-[var(--bg-surface)]" />
                  ))}
              </div>
            </div>
          </div>
        ) : null}

        {!canWrite ? (
          <div className="pointer-events-auto absolute left-3 right-3 top-[calc(env(safe-area-inset-top)+13.5rem)] z-[56] md:left-6 md:right-auto md:max-w-sm">
            <p className="glass-panel rounded-2xl border border-amber-500/35 px-4 py-2 text-center text-xs font-semibold text-amber-950 dark:text-amber-100">
              View only — pan and zoom; editing disabled.
            </p>
          </div>
        ) : null}

        {showSharePanel ? (
          <CanvasShareSheet open={shareOpen} onClose={() => setShareOpen(false)} title="Share note">
            <SheetShareForm sheetId={sheetId} inviterName={userName} inviterImage={userImage} />
          </CanvasShareSheet>
        ) : null}

        {busy !== null ? (
          <div
            data-sheet-busy
            className="pointer-events-auto fixed inset-0 flex items-center justify-center p-6"
            role="alertdialog"
            aria-busy="true"
            aria-label={busyLabel}
          >
            <div className="absolute inset-0 bg-black/72 backdrop-blur-sm" aria-hidden />
            <div className="relative w-full max-w-sm rounded-[1.5rem] border border-white/20 bg-[color-mix(in_srgb,var(--bg-surface)_95%,transparent)] px-8 py-10 text-center shadow-2xl backdrop-blur-xl dark:border-white/10">
              <Loader2 className="mx-auto mb-5 h-10 w-10 animate-spin text-[var(--color-accent)]" aria-hidden />
              <p className="text-base font-semibold text-gray-900 dark:text-white">{busyLabel}</p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                This may take a moment for large files.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <style jsx global>{`
        .tl-container {
          --color-background: var(--bg-canvas);
          --color-panel: var(--bg-surface);
          --color-overlay: color-mix(in srgb, var(--bg-surface) 80%, transparent);
          border-radius: 0 !important;
          overflow: visible !important;
        }

        .tl-ui-toolbar {
          border-radius: 9999px !important;
          backdrop-filter: blur(var(--glass-blur)) saturate(1.2) !important;
          -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.2) !important;
          background: var(--glass-bg) !important;
          border: 1px solid var(--glass-border) !important;
          box-shadow: var(--shadow-float), inset 0 1px 0 0 var(--glass-highlight) !important;
          padding: 10px 12px !important;
          margin-bottom: max(14px, env(safe-area-inset-bottom)) !important;
          transition:
            opacity 200ms cubic-bezier(0.22, 1, 0.36, 1),
            transform 200ms cubic-bezier(0.22, 1, 0.36, 1) !important;
        }

        ::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
