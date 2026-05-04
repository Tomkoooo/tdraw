"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import localforage from "localforage";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { sceneCoordsToViewportCoords, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import {
  ChevronLeft,
  ChevronRight,
  Moon,
  FileDown,
  FileUp,
  Loader2,
  PenLine,
  Plus,
  RefreshCcw,
  Settings,
  Sun,
  Trash2,
  Users,
  Wand2,
  Save,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { saveSheetState, updateSheetTitle } from "@/lib/actions/sheet";
import { getRealtimeToken } from "@/lib/actions/socketToken";
import { exportEditorToPdf, exportPagesToPdf } from "@/lib/pdf/exportEditorToPdf";
import { importPdfToEditor, renderPdfToPages } from "@/lib/pdf/importPdfToEditor";
import { setActiveToolFreedraw } from "@/lib/native/excalidrawPencilActions";
import { insertHandwrittenTextAtScenePoint } from "@/lib/native/handwritingToExcalidraw";
import type { MathSuggestion } from "@/lib/native/mathSuggestions";
import SheetVisitRecorder from "@/components/SheetVisitRecorder";
import UserAvatar from "@/components/UserAvatar";
import SheetShareForm from "@/components/SheetShareForm";
import CanvasShareSheet from "@/components/canvas/CanvasShareSheet";
import type { ExcalidrawImperativeApiLike } from "@/components/canvas/ExcalidrawCanvas";
import { usePencilEnhanced } from "@/hooks/usePencilEnhanced";
import {
  getExcalidrawPenMode,
  getInkMathSuggestionEnabled,
  getInkToTextModeEnabled,
  getOcrLocale,
  getPencilDoubleTapAction,
  getPencilOnlyInput,
  getScribbleEraseEnabled,
  getUseTesseractFallback,
  setExcalidrawPenMode,
  setInkMathSuggestionEnabled,
  setInkToTextModeEnabled,
  setOcrLocale,
  setPencilDoubleTapAction,
  setPencilOnlyInput,
  setScribbleEraseEnabled,
  setUseTesseractFallback,
  type PencilDoubleTapAction,
} from "@/lib/native/pencilSettings";

const ExcalidrawCanvas = dynamic(() => import("./canvas/ExcalidrawCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-(--bg-canvas)">
      <Loader2 className="h-8 w-8 animate-spin text-(--color-accent)" />
    </div>
  ),
});

interface ExcalidrawEditorProps {
  sheetId: string;
  initialData: unknown;
  title: string;
  canWrite: boolean;
  canTitle: boolean;
  contentVersion: number;
  hotbarToolIds: string[];
  userName?: string | null;
  userImage?: string | null;
  userId?: string;
  organizationId?: string | null;
  showSharePanel?: boolean;
  /** Raw public share token from `/share/sheet/[token]` — authenticates realtime as read-only + laser. */
  shareReadToken?: string | null;
  /** When true with `!canWrite`, pointer moves broadcast as laser (for anonymous public share). */
  sharePublicLaserMode?: boolean;
  /** ISO timestamp of last server `updatedAt` when the page loaded — shown until you save again. */
  initialServerUpdatedAt?: string;
}

type BusyKind = "import" | "export";
type PdfImportMode = "perPage" | "stackCurrent" | "stackNew";
type PdfExportMode = "current" | "all";
type SceneFile = {
  id: string;
  dataURL: string;
  mimeType: string;
  created: number;
  lastRetrieved?: number;
};
type PersistedScene = {
  elements: Record<string, unknown>[];
  appState: Record<string, unknown>;
  files: Record<string, SceneFile>;
};
type PersistedPage = {
  id: string;
  name: string;
  elements: Record<string, unknown>[];
  appState: Record<string, unknown>;
};
type PersistedDocument = {
  version: 2;
  activePageId: string;
  pages: PersistedPage[];
  files: Record<string, SceneFile>;
};
type SaveState = "unsaved" | "offlineQueued" | "saving" | "saved";
type MinimapState = {
  scene: { minX: number; minY: number; maxX: number; maxY: number } | null;
  viewport: { x: number; y: number; width: number; height: number } | null;
};

type SheetPresenceMember = {
  fromSocketId: string;
  userId: string;
  name: string;
  color: string;
  image?: string;
  editing?: boolean;
};

type RemoteCursor = {
  x: number;
  y: number;
  pageId?: string;
  color: string;
  name: string;
  at: number;
  laser?: boolean;
  /** Laser stroke samples; `t` is used to drop old segments quickly. */
  trail?: { x: number; y: number; t: number }[];
};

/** Drop trail segments older than this so the laser tail vanishes quickly. */
const LASER_TRAIL_POINT_MS = 420;
/** Remove laser cursor overlay soon after the peer stops sending. */
const REMOTE_LASER_IDLE_MS = 720;
/** Non-laser remote pointer can stay visible longer while idle. */
const REMOTE_CURSOR_STALE_MS = 2000;
const CURSOR_PRUNE_INTERVAL_MS = 120;
const LIVE_SCENE_EMIT_MS = 140;
const LIVE_SCENE_FULL_SYNC_MS = 1800;

const queueKey = (sheetId: string) => `excalidraw-save-queue-${sheetId}`;
const cachedDocKey = (sheetId: string) => `excalidraw-cached-doc-${sheetId}`;
const DEFAULT_PAGE_NAME = "Page 1";

type CachedDocumentEnvelope = {
  doc: PersistedDocument;
  contentVersion: number;
  updatedAt: number;
};

function parseCachedDocument(raw: unknown): CachedDocumentEnvelope | null {
  if (!isObj(raw) || !("doc" in raw)) return null;
  const contentVersion = typeof raw.contentVersion === "number" && Number.isFinite(raw.contentVersion) ? raw.contentVersion : 0;
  const updatedAt = typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now();
  return { doc: parsePersistedDocument(raw.doc), contentVersion, updatedAt };
}

async function writeCachedDocument(sheetId: string, doc: PersistedDocument, contentVersion: number) {
  const envelope: CachedDocumentEnvelope = {
    doc,
    contentVersion: Number.isFinite(contentVersion) ? contentVersion : 0,
    updatedAt: Date.now(),
  };
  await localforage.setItem(cachedDocKey(sheetId), envelope);
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Keep any Excalidraw scene item with id + type. Requiring numeric x/y/w/h dropped real strokes
 * (Excalidraw often omits or defers dimensions), which emptied `documentState`, broke autosave
 * fingerprints, and stripped elements when loading from Mongo.
 */
function isSceneElement(value: unknown): value is Record<string, unknown> {
  if (!isObj(value)) return false;
  return typeof value.type === "string" && value.type.length > 0 && typeof value.id === "string" && value.id.length > 0;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  if (typeof error === "string" && error.trim().length > 0) return error;
  return "Unknown error";
}

function isLikelyNetworkSaveError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network error") ||
    message.includes("load failed") ||
    message.includes("err_network") ||
    message.includes("fetch failed")
  );
}

function parseScene(raw: unknown): { elements: Record<string, unknown>[]; files: SceneFile[] } {
  if (!isObj(raw)) return { elements: [], files: [] };
  if ("store" in raw || "schema" in raw) return { elements: [], files: [] };

  const elements = Array.isArray(raw.elements) ? raw.elements.filter(isSceneElement) : [];
  const filesRecord = isObj(raw.files) ? raw.files : {};
  const files = Object.values(filesRecord).filter((v): v is SceneFile => {
    if (!isObj(v)) return false;
    return (
      typeof v.id === "string" &&
      typeof v.dataURL === "string" &&
      typeof v.mimeType === "string" &&
      typeof v.created === "number"
    );
  });
  return { elements, files };
}

function createPageId() {
  return `page-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function createDefaultPage(overrides?: Partial<PersistedPage>): PersistedPage {
  return {
    id: overrides?.id ?? createPageId(),
    name: overrides?.name ?? DEFAULT_PAGE_NAME,
    elements: overrides?.elements ?? [],
    appState: overrides?.appState ?? {},
  };
}

function parsePersistedDocument(raw: unknown): PersistedDocument {
  const legacy = parseScene(raw);
  const obj = isObj(raw) ? raw : null;
  const files = isObj(obj?.files) ? (obj?.files as Record<string, SceneFile>) : {};

  if (obj?.version === 2 && Array.isArray(obj.pages)) {
    const pages = obj.pages
      .map((page): PersistedPage | null => {
        if (!isObj(page)) return null;
        const id = typeof page.id === "string" && page.id.length > 0 ? page.id : createPageId();
        const name = typeof page.name === "string" && page.name.trim().length > 0 ? page.name.trim() : "Page";
        const elements = Array.isArray(page.elements) ? page.elements.filter(isSceneElement) : [];
        const appState = isObj(page.appState) ? page.appState : {};
        return { id, name, elements, appState };
      })
      .filter((page): page is PersistedPage => Boolean(page));
    const ensuredPages = pages.length > 0 ? pages : [createDefaultPage()];
    const activePageId =
      typeof obj.activePageId === "string" && ensuredPages.some((page) => page.id === obj.activePageId)
        ? obj.activePageId
        : ensuredPages[0].id;
    return {
      version: 2,
      activePageId,
      pages: ensuredPages,
      files,
    };
  }

  const defaultPage = createDefaultPage({
    elements: legacy.elements,
    appState: {},
  });
  return {
    version: 2,
    activePageId: defaultPage.id,
    pages: [defaultPage],
    files,
  };
}

function toFinite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getElementBounds(elements: readonly Record<string, unknown>[]): MinimapState["scene"] {
  if (!elements.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const element of elements) {
    const x = toFinite(element.x);
    const y = toFinite(element.y);
    const width = toFinite(element.width);
    const height = toFinite(element.height);
    const left = Math.min(x, x + width);
    const right = Math.max(x, x + width);
    const top = Math.min(y, y + height);
    const bottom = Math.max(y, y + height);

    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

/** Sampled point coords so freedraw edits change the fingerprint (length-only was too lossy). */
function pointsDigest(element: Record<string, unknown>): string {
  const pts = Array.isArray(element.points) ? element.points : [];
  const n = pts.length;
  if (n === 0) return "0";
  const step = Math.max(1, Math.floor(n / 24));
  let s = `${n}:`;
  for (let i = 0; i < n; i += step) {
    const p = pts[i];
    if (Array.isArray(p) && p.length >= 2) {
      s += `${Math.round(Number(p[0]) * 100)}x${Math.round(Number(p[1]) * 100)},`;
    }
  }
  return s.slice(0, 320);
}

function buildSceneFingerprint(elements: readonly Record<string, unknown>[]): string {
  return elements
    .map((element) => {
      const id = typeof element.id === "string" ? element.id : "";
      const version = typeof element.version === "number" ? element.version : 0;
      const deleted = Boolean(element.isDeleted);
      const x = typeof element.x === "number" ? element.x : 0;
      const y = typeof element.y === "number" ? element.y : 0;
      const width = typeof element.width === "number" ? element.width : 0;
      const height = typeof element.height === "number" ? element.height : 0;
      const angle = typeof element.angle === "number" ? element.angle : 0;
      const pointsLen = Array.isArray(element.points) ? element.points.length : 0;
      const text = typeof element.text === "string" ? element.text : "";
      const stroke = typeof element.strokeColor === "string" ? element.strokeColor : "";
      return `${id}:${version}:${deleted ? 1 : 0}:${x}:${y}:${width}:${height}:${angle}:${pointsLen}:${stroke}:${text}:${pointsDigest(element)}`;
    })
    .sort()
    .join("|");
}

type SceneDeltaPayload = {
  upserts: Record<string, unknown>[];
  removeIds: string[];
};

function elementToken(element: Record<string, unknown>): string {
  const id = typeof element.id === "string" ? element.id : "";
  const version = typeof element.version === "number" ? element.version : 0;
  const deleted = Boolean(element.isDeleted);
  return `${id}:${version}:${deleted ? 1 : 0}`;
}

function indexScene(elements: Record<string, unknown>[]) {
  const byId = new Map<string, Record<string, unknown>>();
  const tokenById = new Map<string, string>();
  for (const element of elements) {
    const id = typeof element.id === "string" ? element.id : "";
    if (!id) continue;
    byId.set(id, element);
    tokenById.set(id, elementToken(element));
  }
  return { byId, tokenById };
}

function buildSceneDelta(
  prevTokens: Map<string, string>,
  elements: Record<string, unknown>[],
): { delta: SceneDeltaPayload; nextTokens: Map<string, string>; hasChanges: boolean } {
  const { byId, tokenById } = indexScene(elements);
  const upserts: Record<string, unknown>[] = [];
  const removeIds: string[] = [];

  for (const [id, token] of tokenById.entries()) {
    if (prevTokens.get(id) !== token) {
      const item = byId.get(id);
      if (item) upserts.push(item);
    }
  }
  for (const id of prevTokens.keys()) {
    if (!tokenById.has(id)) removeIds.push(id);
  }

  return {
    delta: { upserts, removeIds },
    nextTokens: tokenById,
    hasChanges: upserts.length > 0 || removeIds.length > 0,
  };
}

function applySceneDelta(
  currentElements: Record<string, unknown>[],
  delta: SceneDeltaPayload,
): Record<string, unknown>[] {
  const nextById = new Map<string, Record<string, unknown>>();
  for (const el of currentElements) {
    const id = typeof el.id === "string" ? el.id : "";
    if (!id) continue;
    nextById.set(id, el);
  }
  for (const id of delta.removeIds) {
    nextById.delete(id);
  }
  for (const el of delta.upserts) {
    const id = typeof el.id === "string" ? el.id : "";
    if (!id) continue;
    nextById.set(id, el);
  }
  return [...nextById.values()];
}

export default function ExcalidrawEditor({
  sheetId,
  initialData,
  title: initialTitle,
  canWrite,
  canTitle,
  contentVersion,
  hotbarToolIds,
  userName,
  userImage,
  userId,
  showSharePanel = true,
  shareReadToken = null,
  sharePublicLaserMode = false,
  initialServerUpdatedAt,
}: ExcalidrawEditorProps) {
  void hotbarToolIds;

  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [busy, setBusy] = useState<BusyKind | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [showImportModeDialog, setShowImportModeDialog] = useState(false);
  const [showExportModeDialog, setShowExportModeDialog] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [documentState, setDocumentState] = useState<PersistedDocument>(() => parsePersistedDocument(initialData));
  const [activePageId, setActivePageId] = useState(() => parsePersistedDocument(initialData).activePageId);
  const [isClearing, setIsClearing] = useState(false);
  const [members, setMembers] = useState<Record<string, SheetPresenceMember>>({});
  const [mySocketId, setMySocketId] = useState<string | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
  const [cursorRerender, setCursorRerender] = useState(0);
  const [excalidrawTheme, setExcalidrawTheme] = useState<"light" | "dark">("light");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastServerSaveAtMs, setLastServerSaveAtMs] = useState<number | null>(() => {
    if (typeof initialServerUpdatedAt !== "string" || !initialServerUpdatedAt.trim()) return null;
    const t = Date.parse(initialServerUpdatedAt);
    return Number.isFinite(t) ? t : null;
  });
  const [isOnline, setIsOnline] = useState(true);
  const [minimapState, setMinimapState] = useState<MinimapState>({ scene: null, viewport: null });
  const [renamePageOpen, setRenamePageOpen] = useState(false);
  const [renamePageValue, setRenamePageValue] = useState("");
  const [imperativeEpoch, setImperativeEpoch] = useState(0);
  const [pencilDoubleTapSetting, setPencilDoubleTapSetting] = useState<PencilDoubleTapAction>(() => getPencilDoubleTapAction());
  const [scribbleEraseOn, setScribbleEraseOn] = useState(() => getScribbleEraseEnabled());
  const [pencilOnlyOn, setPencilOnlyOn] = useState(() => getPencilOnlyInput());
  const [excalidrawPenModeOn, setExcalidrawPenModeOn] = useState(() => getExcalidrawPenMode());
  const [inkToTextOn, setInkToTextOn] = useState(() => getInkToTextModeEnabled());
  const [inkMathSuggestOn, setInkMathSuggestOn] = useState(() => getInkMathSuggestionEnabled());
  const [ocrLocale, setOcrLocaleState] = useState(() => getOcrLocale());
  const [useTesseractFallback, setUseTesseractFallbackState] = useState(() => getUseTesseractFallback());
  const [pencilSettingsOpen, setPencilSettingsOpen] = useState(false);
  const [pendingMathSuggestion, setPendingMathSuggestion] = useState<{
    original: string;
    expression: string;
    result: string;
    x: number;
    y: number;
  } | null>(null);
  const [pendingInkOcrIds, setPendingInkOcrIds] = useState<string[]>([]);
  const [pendingInkOcrRects, setPendingInkOcrRects] = useState<
    { id: string; left: number; top: number; width: number; height: number }[]
  >([]);
  /** When true, next freedraw strokes use OCR until the tool changes away from freedraw or the user toggles off. */
  const magicInkArmedRef = useRef(false);
  const [magicInkUi, setMagicInkUi] = useState(false);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  /** Same file as `pendingPdfFile`; updated synchronously so import mode buttons never read a stale closure. */
  const pendingPdfFileRef = useRef<File | null>(null);
  const apiRef = useRef<ExcalidrawImperativeApiLike | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAppliedInitialRef = useRef(false);
  const mountedRef = useRef(false);
  const blockSyncRef = useRef(false);
  const hasLocalUnsavedEditsRef = useRef(false);
  const autosaveArmedRef = useRef(false);
  const ignoreAutosaveUntilRef = useRef(0);
  const sceneFingerprintRef = useRef("");
  const versionRef = useRef(Number.isFinite(contentVersion) ? contentVersion : 0);
  const docStateRef = useRef<PersistedDocument>(parsePersistedDocument(initialData));
  const activePageIdRef = useRef(activePageId);
  const mySocketIdRef = useRef<string | null>(null);
  const liveSceneDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLiveFileIdsRef = useRef<Set<string>>(new Set());
  const lastLiveSceneTokensByPageRef = useRef<Map<string, Map<string, string>>>(new Map());
  const lastLiveFullSceneAtRef = useRef(0);
  const lastCursorEmitRef = useRef(0);
  const remoteCursorsRef = useRef<Record<string, RemoteCursor>>({});
  const lastLocalSceneEditAtRef = useRef(0);
  const saveRunningRef = useRef(false);
  const saveAgainRef = useRef(false);
  const saveAgainForceRef = useRef(false);

  useEffect(() => {
    remoteCursorsRef.current = remoteCursors;
  }, [remoteCursors]);

  const userColor = useMemo(() => {
    const palette = ["#0071E3", "#34C759", "#FF9500", "#AF52DE", "#FF2D55"];
    let h = 0;
    for (let i = 0; i < sheetId.length; i++) h = (h + sheetId.charCodeAt(i) * 17) % 997;
    return palette[h % palette.length];
  }, [sheetId]);

  useEffect(() => {
    activePageIdRef.current = activePageId;
  }, [activePageId]);

  useEffect(() => {
    mySocketIdRef.current = mySocketId;
  }, [mySocketId]);

  const membersGrouped = useMemo(() => {
    const byUser = new Map<string, SheetPresenceMember[]>();
    for (const m of Object.values(members)) {
      if (mySocketId && m.fromSocketId === mySocketId) continue;
      const list = byUser.get(m.userId) ?? [];
      list.push(m);
      byUser.set(m.userId, list);
    }
    return Array.from(byUser.entries());
  }, [members, mySocketId]);
  const activePage = useMemo(
    () => documentState.pages.find((page) => page.id === activePageId) ?? documentState.pages[0],
    [activePageId, documentState.pages],
  );

  const applyScene = useCallback(
    (
      api: ExcalidrawImperativeApiLike,
      scene: { elements: Record<string, unknown>[]; files: SceneFile[]; appState?: Record<string, unknown> },
      opts?: { preserveViewport?: boolean },
    ) => {
      blockSyncRef.current = true;
      ignoreAutosaveUntilRef.current = Date.now() + 700;
      try {
        if (scene.files.length > 0) {
          api.addFiles(scene.files as Parameters<ExcalidrawImperativeApiLike["addFiles"]>[0]);
        }
        const cur = api.getAppState() as unknown as Record<string, unknown>;
        const preserveVp = opts?.preserveViewport === true;
        const nextApp: Record<string, unknown> = {
          ...(scene.appState ?? {}),
          viewModeEnabled: !canWrite,
          zenModeEnabled: false,
          collaborators: new Map(),
          ...(canWrite ? { penMode: getExcalidrawPenMode() } : {}),
        };
        if (preserveVp) {
          nextApp.zoom = cur.zoom;
          nextApp.scrollX = cur.scrollX;
          nextApp.scrollY = cur.scrollY;
          nextApp.width = cur.width;
          nextApp.height = cur.height;
          nextApp.offsetLeft = cur.offsetLeft;
          nextApp.offsetTop = cur.offsetTop;
        } else {
          nextApp.zoom = { value: 1 };
          nextApp.scrollX = 0;
          nextApp.scrollY = 0;
        }
        api.updateScene({
          elements: scene.elements as unknown as Parameters<ExcalidrawImperativeApiLike["updateScene"]>[0]["elements"],
          appState: nextApp as Parameters<ExcalidrawImperativeApiLike["updateScene"]>[0]["appState"],
        });
        const currentTheme = api.getAppState().theme === "dark" ? "dark" : "light";
        setExcalidrawTheme((t) => (t === currentTheme ? t : currentTheme));
      } finally {
        blockSyncRef.current = false;
      }
    },
    [canWrite],
  );

  const createSnapshot = useCallback((api: ExcalidrawImperativeApiLike): PersistedScene => {
    const currentFiles = api.getFiles() as unknown as Record<string, SceneFile>;
    return {
      elements: api.getSceneElements() as unknown as Record<string, unknown>[],
      appState: {
        viewBackgroundColor: api.getAppState().viewBackgroundColor,
        theme: api.getAppState().theme,
      },
      files: currentFiles,
    };
  }, []);

  const createDocumentSnapshot = useCallback((api: ExcalidrawImperativeApiLike): PersistedDocument => {
    const pageSnapshot = createSnapshot(api);
    const baseDoc = docStateRef.current;
    const refPageId = activePageIdRef.current;
    const pageId = baseDoc.pages.some((p) => p.id === refPageId) ? refPageId : (baseDoc.pages[0]?.id ?? refPageId);
    const nextPages = baseDoc.pages.map((page) =>
      page.id === pageId
        ? {
            ...page,
            elements: pageSnapshot.elements,
            appState: pageSnapshot.appState,
          }
        : page,
    );
    const mergedFiles = { ...baseDoc.files, ...pageSnapshot.files };
    return {
      version: 2,
      activePageId: pageId,
      pages: nextPages,
      files: mergedFiles,
    };
  }, [createSnapshot]);

  const executeFlushSave = useCallback(
    async (forceOverwrite: boolean) => {
      const api = apiRef.current;
      if (!api || !canWrite) return;

      if (blockSyncRef.current) {
        for (let i = 0; i < 50 && blockSyncRef.current; i += 1) {
          await new Promise<void>((r) => {
            setTimeout(r, 40);
          });
        }
        if (blockSyncRef.current) {
          setSaveState("unsaved");
          toast.error("Couldn’t save while the canvas is updating. Try Save again in a moment.", { id: "sheet-save-blocked" });
          return;
        }
      }

      setSaveState("saving");
      let snapshot: PersistedDocument | null = null;
      try {
        for (let conflictAttempt = 0; conflictAttempt < 2; conflictAttempt++) {
          snapshot = createDocumentSnapshot(api);
          const res = await saveSheetState(
            sheetId,
            snapshot,
            undefined,
            forceOverwrite ? undefined : versionRef.current,
            forceOverwrite,
          );
          if ("conflict" in res && res.conflict) {
            if (typeof res.contentVersion === "number") {
              versionRef.current = res.contentVersion;
            }
            if (conflictAttempt === 0) continue;
            setSaveState("unsaved");
            toast.error("Couldn’t save — this note was updated elsewhere.", {
              id: "sheet-save-conflict",
              action: { label: "Reload", onClick: () => router.refresh() },
            });
            return;
          }
          if ("contentVersion" in res && typeof res.contentVersion === "number") {
            versionRef.current = res.contentVersion;
          }
          break;
        }
        if (!snapshot) return;
        const savedDoc = snapshot;

        const sentPage = savedDoc.pages.find((p) => p.id === savedDoc.activePageId) ?? savedDoc.pages[0];
        const liveEls = api.getSceneElements() as unknown as Record<string, unknown>[];
        const sentFingerprint = buildSceneFingerprint(sentPage?.elements ?? []);
        const liveFingerprint = buildSceneFingerprint(liveEls);
        const hasNewerLocalEdits = sentFingerprint !== liveFingerprint;

        if (!hasNewerLocalEdits) {
          setDocumentState(savedDoc);
          docStateRef.current = savedDoc;
          await writeCachedDocument(sheetId, savedDoc, versionRef.current);
          sceneFingerprintRef.current = liveFingerprint;
          hasLocalUnsavedEditsRef.current = false;
          setLastServerSaveAtMs(Date.now());
          setSaveState("saved");
          socketRef.current?.emit("sheet:snapshot", { sheetId, snapshot: savedDoc, contentVersion: versionRef.current });
        } else {
          // Save succeeded for an older snapshot; keep newer in-memory edits and avoid reverting the canvas.
          setDocumentState((prev) => {
            const merged: PersistedDocument = {
              ...prev,
              files: { ...prev.files, ...savedDoc.files },
            };
            docStateRef.current = merged;
            void writeCachedDocument(sheetId, merged, versionRef.current);
            return merged;
          });
          setSaveState("unsaved");
          toast.message("Partial save: newer edits on canvas were not overwritten. Save again.", { id: "sheet-save-partial" });
        }
      } catch (err) {
        console.error(err);
        const navigatorOffline = typeof navigator !== "undefined" && !navigator.onLine;
        const shouldQueueOffline = navigatorOffline || isLikelyNetworkSaveError(err);
        if (shouldQueueOffline && snapshot) {
          try {
            const queue = ((await localforage.getItem<unknown[]>(queueKey(sheetId))) ?? []) as unknown[];
            queue.push({ snapshot, at: Date.now(), v: versionRef.current });
            await localforage.setItem(queueKey(sheetId), queue);
            setSaveState("offlineQueued");
            toast.warning("Save queued offline. It will sync when back online.");
            return;
          } catch {
            // Fall through to regular save failure state.
          }
        }
        setSaveState("unsaved");
        toast.error(`Couldn’t save note: ${getErrorMessage(err)}`);
      }
    },
    [canWrite, createDocumentSnapshot, router, sheetId],
  );

  const flushSave = useCallback(
    async (forceOverwrite = false) => {
      if (saveRunningRef.current) {
        saveAgainRef.current = true;
        if (forceOverwrite) saveAgainForceRef.current = true;
        return;
      }
      saveRunningRef.current = true;
      let isFirstPass = true;
      try {
        for (;;) {
          saveAgainRef.current = false;
          const force = (isFirstPass && forceOverwrite) || saveAgainForceRef.current;
          isFirstPass = false;
          saveAgainForceRef.current = false;
          await executeFlushSave(force);
          if (!saveAgainRef.current) break;
        }
      } finally {
        saveRunningRef.current = false;
      }
    },
    [executeFlushSave],
  );

  const onManualSave = useCallback(async () => {
    if (!canWrite || busy !== null) return;
    hasLocalUnsavedEditsRef.current = true;
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }
    await flushSave(false);
  }, [busy, canWrite, flushSave]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
      if (canWrite && hasLocalUnsavedEditsRef.current) {
        void flushSave(false);
      }
      mountedRef.current = false;
    };
  }, [canWrite, flushSave]);

  useEffect(() => {
    if (!canWrite || typeof window === "undefined") return;

    const flushNow = () => {
      if (!hasLocalUnsavedEditsRef.current) return;
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
      void flushSave(false);
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasLocalUnsavedEditsRef.current) return;
      flushNow();
      event.preventDefault();
      event.returnValue = "";
    };

    const onPageHide = () => {
      flushNow();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushNow();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [canWrite, flushSave]);

  /** New sheet only: do not tie to contentVersion or a post-save RSC bump clears apiRef while Excalidraw never re-fires excalidrawAPI. */
  useEffect(() => {
    apiRef.current = null;
    hasAppliedInitialRef.current = false;
    autosaveArmedRef.current = false;
    sceneFingerprintRef.current = "";
    versionRef.current = Number.isFinite(contentVersion) ? contentVersion : 0;
    hasLocalUnsavedEditsRef.current = false;
    // contentVersion: initial server version for the new sheet only (not a dep — avoid reset on version bumps).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset canvas refs when the note id changes
  }, [sheetId]);

  /** Same sheet: server version can bump after save + revalidate; keep client in sync without nulling apiRef. */
  useEffect(() => {
    if (!Number.isFinite(contentVersion)) return;
    versionRef.current = Math.max(versionRef.current, contentVersion);
  }, [contentVersion, sheetId]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const syncOnlineState = () => setIsOnline(navigator.onLine);
    syncOnlineState();
    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    return () => {
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
    };
  }, []);

  const handleApiReady = useCallback(
    (api: ExcalidrawImperativeApiLike) => {
      apiRef.current = api;
      setImperativeEpoch((n) => n + 1);
      if (!hasAppliedInitialRef.current) {
        requestAnimationFrame(() => {
          if (!mountedRef.current || !apiRef.current || hasAppliedInitialRef.current) return;
          const parsedDoc = docStateRef.current;
          const page = parsedDoc.pages.find((item) => item.id === parsedDoc.activePageId) ?? parsedDoc.pages[0];
          applyScene(apiRef.current, {
            elements: page?.elements ?? [],
            appState: page?.appState ?? {},
            files: Object.values(parsedDoc.files),
          });
          sceneFingerprintRef.current = buildSceneFingerprint(
            apiRef.current.getSceneElements() as unknown as Record<string, unknown>[],
          );
          autosaveArmedRef.current = true;
          hasAppliedInitialRef.current = true;
        });
      }
    },
    [applyScene],
  );

  const onSceneChange = useCallback(() => {
    if (!canWrite) return;
    hasLocalUnsavedEditsRef.current = true;
    setSaveState("unsaved");
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      void flushSave(false);
    }, 1200);
  }, [canWrite, flushSave]);

  const pointerAppState = useCallback((api: ExcalidrawImperativeApiLike) => {
    return api.getAppState() as unknown as Parameters<typeof viewportCoordsToSceneCoords>[1];
  }, []);

  const onInkOcrPendingChange = useCallback((elementIds: readonly string[]) => {
    setPendingInkOcrIds((prev) => {
      if (elementIds.length === 0) {
        return prev.length === 0 ? prev : [];
      }
      const next = [...elementIds];
      if (prev.length === next.length && prev.every((id, i) => next[i] === id)) return prev;
      return next;
    });
  }, []);

  const onMathSuggestion = useCallback(
    (suggestion: MathSuggestion & { x: number; y: number }) => {
      if (!inkMathSuggestOn) return;
      setPendingMathSuggestion(suggestion);
    },
    [inkMathSuggestOn],
  );

  const { openHandwritingModal } = usePencilEnhanced({
    apiRef,
    imperativeEpoch,
    canWrite,
    pointerAppState,
    onMathSuggestion,
    onInkOcrPendingChange,
    inkOcrArmedRef: magicInkArmedRef,
  });

  useLayoutEffect(() => {
    if (pendingInkOcrIds.length === 0) {
      setPendingInkOcrRects((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    let rafId = 0;
    let cancelled = false;
    let lastSig = "";

    const sample = () => {
      if (cancelled) return;
      const api = apiRef.current;
      const next: { id: string; left: number; top: number; width: number; height: number }[] = [];
      if (api) {
        const ps = pointerAppState(api);
        const els = api.getSceneElements() as unknown as Record<string, unknown>[];
        for (const id of pendingInkOcrIds) {
          const el = els.find((e) => e.id === id && !Boolean(e.isDeleted));
          if (!el || el.type !== "freedraw") continue;
          const x = toFinite(el.x);
          const y = toFinite(el.y);
          const w = toFinite(el.width);
          const h = toFinite(el.height);
          const sx0 = Math.min(x, x + w);
          const sy0 = Math.min(y, y + h);
          const sx1 = Math.max(x, x + w);
          const sy1 = Math.max(y, y + h);
          const corners = [
            { sceneX: sx0, sceneY: sy0 },
            { sceneX: sx1, sceneY: sy0 },
            { sceneX: sx1, sceneY: sy1 },
            { sceneX: sx0, sceneY: sy1 },
          ];
          let minVx = Infinity;
          let minVy = Infinity;
          let maxVx = -Infinity;
          let maxVy = -Infinity;
          for (const c of corners) {
            const v = sceneCoordsToViewportCoords(c, ps);
            minVx = Math.min(minVx, v.x);
            minVy = Math.min(minVy, v.y);
            maxVx = Math.max(maxVx, v.x);
            maxVy = Math.max(maxVy, v.y);
          }
          if (Number.isFinite(minVx) && Number.isFinite(minVy)) {
            next.push({
              id,
              left: minVx,
              top: minVy,
              width: Math.max(1, maxVx - minVx),
              height: Math.max(1, maxVy - minVy),
            });
          }
        }
      }
      const sig = next
        .map((r) => `${r.id}:${Math.round(r.left)}:${Math.round(r.top)}:${Math.round(r.width)}:${Math.round(r.height)}`)
        .join("|");
      if (sig !== lastSig) {
        lastSig = sig;
        setPendingInkOcrRects((prev) => {
          const prevSig = prev
            .map((r) => `${r.id}:${Math.round(r.left)}:${Math.round(r.top)}:${Math.round(r.width)}:${Math.round(r.height)}`)
            .join("|");
          return prevSig === sig ? prev : next;
        });
      }
      rafId = requestAnimationFrame(sample);
    };

    rafId = requestAnimationFrame(sample);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [pendingInkOcrIds, imperativeEpoch, pointerAppState]);

  const onPencilOnlyPointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (!pencilOnlyOn || !canWrite) return;
      if (e.pointerType === "touch") {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [pencilOnlyOn, canWrite],
  );

  const onEditorPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      const api = apiRef.current;
      const s = socketRef.current;
      if (!api || !s?.connected) return;
      const now = Date.now();
      const app = api.getAppState() as unknown as { activeTool?: { type?: string } };
      const isLaser = sharePublicLaserMode ? true : app.activeTool?.type === "laser";
      const minMs = isLaser ? 20 : 38;
      if (now - lastCursorEmitRef.current < minMs) return;
      lastCursorEmitRef.current = now;
      const { x, y } = viewportCoordsToSceneCoords({ clientX: e.clientX, clientY: e.clientY }, pointerAppState(api));
      s.emit("presence:cursor", { sheetId, pageId: activePageIdRef.current, x, y, laser: Boolean(isLaser) });
    },
    [pointerAppState, sheetId, sharePublicLaserMode],
  );

  const onExcalidrawChange = useCallback((elements: readonly unknown[], appState: unknown) => {
      const typedElements = elements.filter(isSceneElement);
      const sceneBounds = getElementBounds(typedElements);
      const appStateObj = isObj(appState) ? appState : {};
      const activeToolRaw = isObj(appStateObj.activeTool) ? appStateObj.activeTool : {};
      const toolType = typeof activeToolRaw.type === "string" ? activeToolRaw.type : "";
      if (magicInkArmedRef.current && toolType !== "freedraw") {
        magicInkArmedRef.current = false;
        setMagicInkUi(false);
      }
      const zoomObj = isObj(appStateObj.zoom) ? appStateObj.zoom : {};
      const zoom = Math.max(0.05, toFinite(zoomObj.value, 1));
      const viewportWidth = Math.max(1, toFinite(appStateObj.width, 1) / zoom);
      const viewportHeight = Math.max(1, toFinite(appStateObj.height, 1) / zoom);
      const viewportX = -toFinite(appStateObj.scrollX, 0) / zoom;
      const viewportY = -toFinite(appStateObj.scrollY, 0) / zoom;

      setMinimapState({
        scene: sceneBounds,
        viewport: { x: viewportX, y: viewportY, width: viewportWidth, height: viewportHeight },
      });

      const appStateForPage = {
        viewBackgroundColor: typeof appStateObj.viewBackgroundColor === "string" ? appStateObj.viewBackgroundColor : undefined,
        theme: appStateObj.theme === "dark" ? "dark" : "light",
      };
      setDocumentState((prev) => {
        const updated = {
          ...prev,
          activePageId,
          pages: prev.pages.map((page) =>
            page.id === activePageId
              ? {
                  ...page,
                  elements: typedElements,
                  appState: appStateForPage,
                }
              : page,
          ),
        };
        docStateRef.current = updated;
        void writeCachedDocument(sheetId, updated, versionRef.current);
        return updated;
      });
      lastLocalSceneEditAtRef.current = Date.now();

      if (canWrite && !blockSyncRef.current) {
        if (liveSceneDebounceRef.current) clearTimeout(liveSceneDebounceRef.current);
        liveSceneDebounceRef.current = setTimeout(() => {
          liveSceneDebounceRef.current = null;
          if (blockSyncRef.current) return;
          const s = socketRef.current;
          if (!s?.connected) return;
          const api = apiRef.current;
          if (!api) return;
          const pageId = activePageIdRef.current;
          const fmap = api.getFiles() as unknown as Record<string, SceneFile>;
          const out: Record<string, SceneFile> = {};
          for (const [k, f] of Object.entries(fmap)) {
            if (!lastLiveFileIdsRef.current.has(k)) {
              out[k] = f;
              lastLiveFileIdsRef.current.add(k);
            }
          }
          const rawElements = api.getSceneElements() as unknown as Record<string, unknown>[];
          const prevTokens = lastLiveSceneTokensByPageRef.current.get(pageId) ?? new Map<string, string>();
          const { delta, nextTokens, hasChanges } = buildSceneDelta(prevTokens, rawElements);
          lastLiveSceneTokensByPageRef.current.set(pageId, nextTokens);
          const forceFull = Date.now() - lastLiveFullSceneAtRef.current > LIVE_SCENE_FULL_SYNC_MS;
          if (!hasChanges && !forceFull) return;
          s.emit("sheet:scene", {
            sheetId,
            pageId,
            elements: forceFull ? rawElements : undefined,
            delta: !forceFull ? delta : undefined,
            files: Object.keys(out).length > 0 ? out : undefined,
          });
          if (forceFull) lastLiveFullSceneAtRef.current = Date.now();
          s.emit("sheet:editing", { sheetId });
        }, LIVE_SCENE_EMIT_MS);
      }

      const nextFingerprint = buildSceneFingerprint(typedElements);
      const fingerprintChanged = nextFingerprint !== sceneFingerprintRef.current;
      const bumpRemoteCursors = () => {
        if (Object.keys(remoteCursorsRef.current).length > 0) setCursorRerender((c) => c + 1);
      };

      if (!autosaveArmedRef.current) {
        if (hasAppliedInitialRef.current && fingerprintChanged && canWrite) {
          sceneFingerprintRef.current = nextFingerprint;
          onSceneChange();
        } else {
          sceneFingerprintRef.current = nextFingerprint;
        }
        bumpRemoteCursors();
        return;
      }
      if (Date.now() < ignoreAutosaveUntilRef.current) {
        if (hasAppliedInitialRef.current && fingerprintChanged && canWrite) {
          sceneFingerprintRef.current = nextFingerprint;
          onSceneChange();
        } else {
          sceneFingerprintRef.current = nextFingerprint;
        }
        bumpRemoteCursors();
        return;
      }
      if (!fingerprintChanged) {
        bumpRemoteCursors();
        return;
      }
      sceneFingerprintRef.current = nextFingerprint;
      onSceneChange();
      bumpRemoteCursors();
    }, [activePageId, canWrite, onSceneChange, sheetId]);

  const onTitleChange = useCallback(
    (nextTitle: string) => {
      if (!canTitle) return;
      setTitle(nextTitle);
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
      titleDebounceRef.current = setTimeout(async () => {
        try {
          await updateSheetTitle(sheetId, nextTitle);
        } catch (err) {
          console.error(err);
        }
      }, 500);
    },
    [canTitle, sheetId],
  );

  /* Only when switching pages — do not depend on activePage/documentState or every scene edit re-applies and loops with onChange. */
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !hasAppliedInitialRef.current) return;
    const doc = docStateRef.current;
    const page = doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0];
    if (!page) return;
    applyScene(api, {
      elements: page.elements,
      appState: page.appState,
      files: Object.values(doc.files),
    });
    sceneFingerprintRef.current = buildSceneFingerprint(page.elements);
  }, [activePageId, applyScene]);

  useEffect(() => {
      const loadCachedDoc = async () => {
        if (typeof navigator === "undefined" || navigator.onLine) return;
        const queue = ((await localforage.getItem<unknown[]>(queueKey(sheetId))) ?? []) as unknown[];
        if (queue.length === 0) return;
        const cached = await localforage.getItem<unknown>(cachedDocKey(sheetId));
        if (!cached) return;
        const envelope = parseCachedDocument(cached);
        const parsed = envelope?.doc ?? parsePersistedDocument(cached);
        setDocumentState(parsed);
        docStateRef.current = parsed;
        setActivePageId(parsed.activePageId);
      };
    void loadCachedDoc();
  }, [sheetId]);

  useEffect(() => {
    lastLiveFileIdsRef.current = new Set(Object.keys(docStateRef.current.files));
    lastLiveSceneTokensByPageRef.current.clear();
    lastLiveFullSceneAtRef.current = 0;
    if (liveSceneDebounceRef.current) {
      clearTimeout(liveSceneDebounceRef.current);
      liveSceneDebounceRef.current = null;
    }
  }, [sheetId]);

  useEffect(() => {
    const id = setInterval(() => {
      setRemoteCursors((prev) => {
        const now = Date.now();
        let changed = false;
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          const c = next[k];
          if (!c) continue;

          if (c.trail && c.trail.length > 0) {
            const trimmed = c.trail.filter((p) => now - p.t < LASER_TRAIL_POINT_MS);
            const nextTrail = trimmed.length >= 2 ? trimmed : [];
            if (nextTrail.length !== c.trail.length) {
              next[k] = { ...c, trail: nextTrail };
              changed = true;
            }
          }

          const cur = next[k];
          if (!cur) continue;
          const laserish = Boolean(cur.laser) || (cur.trail?.length ?? 0) >= 2;
          const staleMs = laserish ? REMOTE_LASER_IDLE_MS : REMOTE_CURSOR_STALE_MS;
          if (now - cur.at > staleMs) {
            delete next[k];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, CURSOR_PRUNE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let socket: Socket | null = null;
    let onConnectHandler: (() => void) | null = null;

    const connect = async () => {
      try {
        const cfg = await fetch("/api/realtime-config").then((r) => r.json());
        const url = typeof cfg.url === "string" && cfg.url.trim().length > 0 ? cfg.url.trim() : undefined;
        const name = userName || "Guest";
        const auth =
          shareReadToken && shareReadToken.length > 0
            ? { shareToken: shareReadToken, sheetId, name, color: userColor, image: userImage || "" }
            : { token: (await getRealtimeToken()).token, name, color: userColor, image: userImage || "" };
        const options = { auth };
        socket = url ? io(url, options) : io(options);
        socketRef.current = socket;
        onConnectHandler = () => {
          if (!socket) return;
          const sid = socket.id ?? null;
          setMySocketId(sid);
          mySocketIdRef.current = sid;
          socket.emit("joinSheet", sheetId);
        };
        onConnectHandler();
        socket.on("connect", onConnectHandler);

        socket.on(
          "sheet:snapshot",
          ({
            snapshot,
            contentVersion: incomingVersion,
            fromSocketId,
          }: {
            snapshot?: unknown;
            contentVersion?: number;
            fromSocketId?: string;
          }) => {
            if (fromSocketId && fromSocketId === mySocketIdRef.current) return;
            if (typeof incomingVersion !== "number" || incomingVersion <= versionRef.current) return;
            const api = apiRef.current;
            if (!api) return;
            if (hasLocalUnsavedEditsRef.current) {
              void flushSave(false);
            }
            const parsedDoc = parsePersistedDocument(snapshot);
            const remotePage = parsedDoc.pages.find((page) => page.id === parsedDoc.activePageId) ?? parsedDoc.pages[0];
            setDocumentState(parsedDoc);
            docStateRef.current = parsedDoc;
            setActivePageId(parsedDoc.activePageId);
            applyScene(
              api,
              {
                elements: remotePage?.elements ?? [],
                appState: remotePage?.appState ?? {},
                files: Object.values(parsedDoc.files),
              },
              { preserveViewport: true },
            );
            versionRef.current = incomingVersion;
            void writeCachedDocument(sheetId, parsedDoc, incomingVersion);
            hasLocalUnsavedEditsRef.current = false;
          },
        );

        socket.on(
          "sheet:scene",
          (payload: {
            pageId?: string;
            elements?: unknown;
            delta?: SceneDeltaPayload;
            files?: unknown;
            fromSocketId?: string;
          }) => {
            if (!payload.fromSocketId || payload.fromSocketId === mySocketIdRef.current) return;
            if (!Array.isArray(payload.elements) && !payload.delta) return;
            const pageId = payload.pageId;
            const localEditAgeMs = Date.now() - lastLocalSceneEditAtRef.current;
            // Guard against late/stale remote scene packets clobbering a shape immediately after local pointer release.
            if (pageId && pageId === activePageIdRef.current && localEditAgeMs < 900) return;
            const filesRec =
              payload.files && typeof payload.files === "object"
                ? (payload.files as Record<string, SceneFile>)
                : undefined;
            const fileArr = filesRec ? Object.values(filesRec) : [];
            if (pageId && pageId === activePageIdRef.current) {
              const api = apiRef.current;
              if (!api) return;
              const page = docStateRef.current.pages.find((p) => p.id === pageId);
              const currentPageElements = (page?.elements ?? []) as Record<string, unknown>[];
              const nextElements = Array.isArray(payload.elements)
                ? (payload.elements as Record<string, unknown>[])
                : payload.delta
                  ? applySceneDelta(currentPageElements, payload.delta)
                  : currentPageElements;
              applyScene(
                api,
                {
                  elements: nextElements,
                  appState: page?.appState ?? {},
                  files: fileArr,
                },
                { preserveViewport: true },
              );
              setDocumentState((prev) => {
                const mergedFiles = { ...prev.files, ...(filesRec ?? {}) };
                const next: PersistedDocument = {
                  ...prev,
                  files: mergedFiles,
                  pages: prev.pages.map((p) => (p.id === pageId ? { ...p, elements: nextElements } : p)),
                };
                docStateRef.current = next;
                return next;
              });
            } else if (pageId) {
              setDocumentState((prev) => {
                const mergedFiles = { ...prev.files, ...(filesRec ?? {}) };
                const page = prev.pages.find((p) => p.id === pageId);
                const currentPageElements = (page?.elements ?? []) as Record<string, unknown>[];
                const nextElements = Array.isArray(payload.elements)
                  ? (payload.elements as Record<string, unknown>[])
                  : payload.delta
                    ? applySceneDelta(currentPageElements, payload.delta)
                    : currentPageElements;
                const next: PersistedDocument = {
                  ...prev,
                  files: mergedFiles,
                  pages: prev.pages.map((p) => (p.id === pageId ? { ...p, elements: nextElements } : p)),
                };
                docStateRef.current = next;
                return next;
              });
            }
          },
        );

        socket.on(
          "presence:sync",
          (payload: {
            members?: Array<{
              userId?: string;
              name?: string;
              color?: string;
              image?: string;
              fromSocketId?: string;
            }>;
          }) => {
            const rows = Array.isArray(payload?.members) ? payload.members : [];
            if (rows.length === 0) return;
            setMembers((prev) => {
              const next = { ...prev };
              for (const row of rows) {
                const sid = row.fromSocketId;
                const uid = row.userId;
                if (!sid || !uid || sid === mySocketIdRef.current) continue;
                next[sid] = {
                  fromSocketId: sid,
                  userId: uid,
                  name: row.name || "User",
                  color: row.color || "#0071E3",
                  image: row.image || undefined,
                  editing: Boolean(next[sid]?.editing),
                };
              }
              return next;
            });
          },
        );

        socket.on(
          "presence:list",
          (payload: {
            userId?: string;
            joined?: boolean;
            left?: boolean;
            name?: string;
            color?: string;
            image?: string;
            fromSocketId?: string;
          }) => {
            const sid = payload.fromSocketId;
            if (payload.left) {
              if (sid) {
                setMembers((prev) => {
                  const n = { ...prev };
                  delete n[sid];
                  return n;
                });
                setRemoteCursors((c) => {
                  const x = { ...c };
                  delete x[sid];
                  return x;
                });
              } else if (payload.userId) {
                setMembers((prev) => {
                  const n = { ...prev };
                  for (const k of Object.keys(n)) {
                    if (n[k]?.userId === payload.userId) delete n[k];
                  }
                  return n;
                });
              }
              return;
            }
            if (payload.joined && payload.userId && sid) {
              if (sid === mySocketIdRef.current) return;
              setMembers((prev) => ({
                ...prev,
                [sid]: {
                  fromSocketId: sid,
                  userId: payload.userId!,
                  name: payload.name || "User",
                  color: payload.color || "#0071E3",
                  image: payload.image || undefined,
                  editing: false,
                },
              }));
            }
          },
        );

        socket.on(
          "sheet:peerEditing",
          (payload: { fromSocketId?: string; userId?: string; editing?: boolean; name?: string; image?: string }) => {
            if (!payload.fromSocketId || payload.fromSocketId === mySocketIdRef.current) return;
            setMembers((prev) => {
              const m = prev[payload.fromSocketId!];
              if (!m) return prev;
              return {
                ...prev,
                [payload.fromSocketId!]: { ...m, editing: !!payload.editing },
              };
            });
          },
        );

        socket.on(
          "presence:cursor",
          (payload: {
            fromSocketId?: string;
            pageId?: string;
            x?: number;
            y?: number;
            color?: string;
            name?: string;
            laser?: boolean;
          }) => {
            if (!payload.fromSocketId || payload.fromSocketId === mySocketIdRef.current) return;
            if (typeof payload.x !== "number" || typeof payload.y !== "number") return;
            if (payload.pageId && payload.pageId !== activePageIdRef.current) return;
            const rx = payload.x;
            const ry = payload.y;
            const fsid = payload.fromSocketId as string;
            const laser = Boolean(payload.laser);
            const now = Date.now();
            setRemoteCursors((prev) => {
              const prior = prev[fsid];
              const trail = laser
                ? [
                    ...(prior?.trail ?? []).filter((p) => now - p.t < LASER_TRAIL_POINT_MS),
                    { x: rx, y: ry, t: now },
                  ].slice(-72)
                : [];
              return {
                ...prev,
                [fsid]: {
                  x: rx,
                  y: ry,
                  pageId: payload.pageId,
                  color: payload.color || "#0071E3",
                  name: payload.name || "User",
                  at: now,
                  laser,
                  trail,
                },
              };
            });
            setCursorRerender((c) => c + 1);
          },
        );
      } catch (err) {
        console.warn("Realtime unavailable", err);
      }
    };

    void connect();
    return () => {
      if (liveSceneDebounceRef.current) {
        clearTimeout(liveSceneDebounceRef.current);
        liveSceneDebounceRef.current = null;
      }
      if (onConnectHandler && socket) {
        socket.off("connect", onConnectHandler);
      }
      socket?.emit("leaveSheet", sheetId);
      socket?.disconnect();
      socketRef.current = null;
      setMySocketId(null);
      mySocketIdRef.current = null;
      setMembers({});
      setRemoteCursors({});
    };
  }, [applyScene, flushSave, sheetId, shareReadToken, userColor, userName, userImage]);

  useEffect(() => {
    const flushQueue = async () => {
      const queue = ((await localforage.getItem<unknown[]>(queueKey(sheetId))) ?? []) as unknown[];
      if (!queue.length || !canWrite) return;
      const item = queue[0] as { snapshot?: PersistedDocument; v?: number } | undefined;
      if (!item?.snapshot) return;
      try {
        const res = await saveSheetState(sheetId, item.snapshot, undefined, item.v ?? versionRef.current);
        if ("conflict" in res && res.conflict) {
          await localforage.setItem(queueKey(sheetId), []);
          setSaveState("unsaved");
          toast.error("Offline queue conflicted with newer server version.");
          return;
        }
        if ("contentVersion" in res && typeof res.contentVersion === "number") {
          versionRef.current = res.contentVersion;
        }
        queue.shift();
        await localforage.setItem(queueKey(sheetId), queue);
        if (queue.length === 0) setLastServerSaveAtMs(Date.now());
        setSaveState(queue.length > 0 ? "offlineQueued" : "saved");
      } catch {
        setSaveState("offlineQueued");
        // still offline
      }
    };

    void flushQueue();
    window.addEventListener("online", flushQueue);
    return () => window.removeEventListener("online", flushQueue);
  }, [canWrite, sheetId]);

  const onImportPdf = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || !canWrite) return;
      pendingPdfFileRef.current = file;
      setPendingPdfFile(file);
      setShowImportModeDialog(true);
    },
    [canWrite],
  );

  const runPdfImport = useCallback(
    async (mode: PdfImportMode) => {
      const file = pendingPdfFileRef.current;
      const api = apiRef.current;
      if (!canWrite) return;
      if (!file) {
        toast.error("No PDF loaded. Use Import and pick a file again.", { id: "pdf-import-no-file" });
        return;
      }
      if (docStateRef.current.pages.length === 0) {
        toast.error("This note has no pages — cannot import a PDF.", { id: "pdf-import-no-pages" });
        return;
      }
      if (!api) {
        toast.error("Canvas is still loading. Wait a moment, then tap your import option again.", {
          id: "pdf-import-no-api",
        });
        return;
      }
      setShowImportModeDialog(false);
      setPendingPdfFile(null);
      pendingPdfFileRef.current = null;
      setBusy("import");
      try {
        if (mode === "stackCurrent") {
          await importPdfToEditor(api as unknown as Parameters<typeof importPdfToEditor>[0], file);
          await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        } else {
          const importedPages = await renderPdfToPages(file);
          const filesById = Object.fromEntries(importedPages.map((page) => [page.file.id, page.file]));
          if (mode === "perPage") {
            const addedPages: PersistedPage[] = importedPages.map((pdfPage, index) => ({
              id: createPageId(),
              name: `${file.name.replace(/\.pdf$/i, "") || "PDF"} ${index + 1}`,
              elements: [{ ...pdfPage.imageElement }],
              appState: {},
            }));
            const nextDoc: PersistedDocument = {
              ...docStateRef.current,
              pages: [...docStateRef.current.pages, ...addedPages],
              files: { ...docStateRef.current.files, ...filesById },
              activePageId: addedPages[0]?.id ?? activePageId,
            };
            docStateRef.current = nextDoc;
            setDocumentState(nextDoc);
            setActivePageId(nextDoc.activePageId);
          } else {
            let y = 0;
            const stacked = importedPages.map((page) => {
              const element = { ...page.imageElement, y };
              y += page.imageElement.height + 50;
              return element;
            });
            const newPage: PersistedPage = {
              id: createPageId(),
              name: `${file.name.replace(/\.pdf$/i, "") || "PDF"} page`,
              elements: stacked,
              appState: {},
            };
            const nextDoc: PersistedDocument = {
              ...docStateRef.current,
              pages: [...docStateRef.current.pages, newPage],
              files: { ...docStateRef.current.files, ...filesById },
              activePageId: newPage.id,
            };
            docStateRef.current = nextDoc;
            setDocumentState(nextDoc);
            setActivePageId(newPage.id);
          }
        }
        await flushSave(false);
      } catch (err) {
        console.error(err);
        toast.error("PDF import failed.");
      } finally {
        setBusy(null);
      }
    },
    [activePageId, canWrite, flushSave],
  );

  const runPdfExport = useCallback(async (mode: PdfExportMode) => {
    if (!apiRef.current || !activePage) return;
    setShowExportModeDialog(false);
    setBusy("export");
    try {
      if (mode === "all") {
        const pagesPayload = documentState.pages.map((page) => ({
          elements: page.elements,
          appState: page.appState,
          files: documentState.files,
        }));
        await exportPagesToPdf(pagesPayload, title || "note");
      } else {
        await exportEditorToPdf(
          {
            elements: activePage.elements,
            appState: activePage.appState,
            files: documentState.files,
          },
          title || "note",
        );
      }
    } catch (err) {
      console.error(err);
      toast.error("PDF export failed.");
    } finally {
      setBusy(null);
    }
  }, [activePage, documentState.files, documentState.pages, title]);

  const onResetView = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const cur = api.getAppState();
    api.updateScene({
      appState: {
        ...cur,
        viewModeEnabled: !canWrite,
        zenModeEnabled: false,
        zoom: { value: 1 },
        scrollX: 0,
        scrollY: 0,
        penMode: canWrite ? getExcalidrawPenMode() : false,
      } as Parameters<ExcalidrawImperativeApiLike["updateScene"]>[0]["appState"],
    });
    toast.success("View reset.");
  }, [canWrite]);

  /** Excalidraw often does not treat two-finger pinch as zoom while freedraw is active; these work in any tool. */
  const onToggleMagicInk = useCallback(() => {
    if (!canWrite || busy !== null) return;
    if (!getInkToTextModeEnabled()) {
      toast.message("Turn on “Magic ink” in Apple Pencil settings first.");
      return;
    }
    const next = !magicInkArmedRef.current;
    magicInkArmedRef.current = next;
    setMagicInkUi(next);
    if (next) {
      const api = apiRef.current;
      if (api) setActiveToolFreedraw(api);
    }
  }, [busy, canWrite]);

  const onZoomStep = useCallback((direction: 1 | -1) => {
    const api = apiRef.current;
    if (!api) return;
    const cur = api.getAppState();
    const zoomObj = cur.zoom as unknown as { value?: number };
    const z = typeof zoomObj?.value === "number" && Number.isFinite(zoomObj.value) ? zoomObj.value : 1;
    const factor = 1.15;
    const next = direction === 1 ? z * factor : z / factor;
    const clamped = Math.min(16, Math.max(0.1, next));
    api.updateScene({
      appState: {
        ...cur,
        zoom: { value: clamped },
      } as Parameters<ExcalidrawImperativeApiLike["updateScene"]>[0]["appState"],
    });
  }, []);

  const onInsertMathSuggestion = useCallback(() => {
    const api = apiRef.current;
    const suggestion = pendingMathSuggestion;
    if (!api || !suggestion || !canWrite) return;
    insertHandwrittenTextAtScenePoint(api, `= ${suggestion.result}`, suggestion.x, suggestion.y, { fontSize: 24 });
    setPendingMathSuggestion(null);
  }, [canWrite, pendingMathSuggestion]);

  const onToggleExcalidrawTheme = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const nextTheme = excalidrawTheme === "dark" ? "light" : "dark";
    api.updateScene({
      appState: {
        ...api.getAppState(),
        theme: nextTheme,
      } as Parameters<ExcalidrawImperativeApiLike["updateScene"]>[0]["appState"],
    });
    setExcalidrawTheme(nextTheme);
  }, [excalidrawTheme]);

  const onClearNote = useCallback(async () => {
    const api = apiRef.current;
    if (!api || !canWrite || isClearing || !activePage) return;
    if (!window.confirm(`Reset "${activePage.name}" to a blank canvas?`)) return;
    setIsClearing(true);
    try {
      const nextDoc: PersistedDocument = {
        ...docStateRef.current,
        pages: docStateRef.current.pages.map((page) =>
          page.id === activePage.id ? { ...page, elements: [], appState: {} } : page,
        ),
      };
      docStateRef.current = nextDoc;
      setDocumentState(nextDoc);
      applyScene(api, { elements: [], appState: {}, files: Object.values(nextDoc.files) });
      await flushSave(true);
      toast.success("Page reset.");
    } catch (err) {
      console.error(err);
      toast.error("Couldn’t reset note.");
    } finally {
      setIsClearing(false);
    }
  }, [activePage, applyScene, canWrite, flushSave, isClearing]);

  const onAddPage = useCallback(() => {
    if (!canWrite) return;
    const newPage = createDefaultPage({ name: `Page ${documentState.pages.length + 1}` });
    const nextDoc: PersistedDocument = {
      ...documentState,
      pages: [...documentState.pages, newPage],
      activePageId: newPage.id,
    };
    docStateRef.current = nextDoc;
    setDocumentState(nextDoc);
    setActivePageId(newPage.id);
    void flushSave(false);
  }, [canWrite, documentState, flushSave]);

  const onRenamePage = useCallback(() => {
    if (!activePage || !canWrite) return;
    const nextName = renamePageValue.trim();
    if (!nextName) return;
    const nextDoc: PersistedDocument = {
      ...documentState,
      pages: documentState.pages.map((page) => (page.id === activePage.id ? { ...page, name: nextName } : page)),
    };
    docStateRef.current = nextDoc;
    setDocumentState(nextDoc);
    setRenamePageOpen(false);
    setRenamePageValue("");
    void flushSave(false);
  }, [activePage, canWrite, documentState, flushSave, renamePageValue]);

  const onDeletePage = useCallback(() => {
    if (!activePage || !canWrite) return;
    if (documentState.pages.length <= 1) {
      toast.warning("At least one page must remain.");
      return;
    }
    if (!window.confirm(`Delete "${activePage.name}"?`)) return;
    const remaining = documentState.pages.filter((page) => page.id !== activePage.id);
    const nextActive = remaining[Math.max(0, documentState.pages.findIndex((p) => p.id === activePage.id) - 1)];
    const nextDoc: PersistedDocument = {
      ...documentState,
      pages: remaining,
      activePageId: nextActive.id,
    };
    docStateRef.current = nextDoc;
    setDocumentState(nextDoc);
    setActivePageId(nextActive.id);
    void flushSave(false);
  }, [activePage, canWrite, documentState, flushSave]);

  const busyLabel = busy === "import" ? "Importing PDF..." : busy === "export" ? "Exporting PDF..." : "";
  const saveStateMeta = useMemo(() => {
    const timeFmt = (ms: number) =>
      new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

    if (!canWrite) {
      return { label: "View only", dotClass: "bg-gray-400/90" };
    }
    if (saveState === "saving") {
      return { label: "Saving to server…", dotClass: "bg-blue-500" };
    }
    if (saveState === "offlineQueued" || !isOnline) {
      return { label: "Queued offline — will sync when online", dotClass: "bg-amber-500" };
    }
    if (saveState === "unsaved") {
      return {
        label: lastServerSaveAtMs
          ? `Unsaved changes (last on server ${timeFmt(lastServerSaveAtMs)})`
          : "Unsaved — not written to server yet",
        dotClass: "bg-red-500",
      };
    }
    if (lastServerSaveAtMs) {
      return {
        label: `On server · ${timeFmt(lastServerSaveAtMs)}`,
        dotClass: "bg-emerald-500",
      };
    }
    return { label: "In sync (open)", dotClass: "bg-emerald-500" };
  }, [canWrite, isOnline, lastServerSaveAtMs, saveState]);
  const minimapView = useMemo(() => {
    const viewport = minimapState.viewport;
    if (!viewport) return null;

    const scene = minimapState.scene;
    const minX = Math.min(scene?.minX ?? viewport.x, viewport.x) - 120;
    const minY = Math.min(scene?.minY ?? viewport.y, viewport.y) - 120;
    const maxX = Math.max(scene?.maxX ?? viewport.x + viewport.width, viewport.x + viewport.width) + 120;
    const maxY = Math.max(scene?.maxY ?? viewport.y + viewport.height, viewport.y + viewport.height) + 120;
    const worldWidth = Math.max(1, maxX - minX);
    const worldHeight = Math.max(1, maxY - minY);

    const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
    const sceneRect = scene
      ? {
          left: clampPercent(((scene.minX - minX) / worldWidth) * 100),
          top: clampPercent(((scene.minY - minY) / worldHeight) * 100),
          width: clampPercent(((scene.maxX - scene.minX) / worldWidth) * 100),
          height: clampPercent(((scene.maxY - scene.minY) / worldHeight) * 100),
        }
      : null;
    const viewportRect = {
      left: clampPercent(((viewport.x - minX) / worldWidth) * 100),
      top: clampPercent(((viewport.y - minY) / worldHeight) * 100),
      width: clampPercent((viewport.width / worldWidth) * 100),
      height: clampPercent((viewport.height / worldHeight) * 100),
    };
    return { sceneRect, viewportRect };
  }, [minimapState]);

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-(--bg-canvas)" style={{ fontSize: 16 }}>
      <SheetVisitRecorder sheetId={sheetId} />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={onImportPdf}
      />

      <div
        className="absolute inset-0"
        onPointerMove={onEditorPointerMove}
        onPointerDownCapture={onPencilOnlyPointerDownCapture}
      >
        <ExcalidrawCanvas excalidrawAPI={handleApiReady} onChange={onExcalidrawChange} viewModeEnabled={!canWrite} />
        {pendingInkOcrRects.length > 0 ? (
          <div className="pointer-events-none absolute inset-0 z-8" aria-hidden>
            {pendingInkOcrRects.map((r) => (
              <div
                key={r.id}
                className="absolute rounded-md border-2 border-(--color-accent) opacity-85 shadow-sm animate-pulse"
                style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
              />
            ))}
          </div>
        ) : null}
        {Object.keys(remoteCursors).length > 0 ? (
          <div key={cursorRerender} className="pointer-events-none absolute inset-0 z-10" aria-hidden>
            {(() => {
              const api = apiRef.current;
              if (!api) return null;
              const ps = pointerAppState(api);
              const trailPolylines: ReactNode[] = [];
              for (const [fromId, c] of Object.entries(remoteCursors)) {
                if (c.pageId && c.pageId !== activePageId) continue;
                const pts = c.trail;
                if (!pts || pts.length < 2) continue;
                const flat = pts
                  .map((p) => {
                    const v = sceneCoordsToViewportCoords({ sceneX: p.x, sceneY: p.y }, ps);
                    return `${v.x},${v.y}`;
                  })
                  .join(" ");
                trailPolylines.push(
                  <polyline
                    key={`trail-${fromId}`}
                    fill="none"
                    stroke={c.color}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.9}
                    points={flat}
                  />,
                );
              }
              return (
                <>
                  {trailPolylines.length > 0 ? (
                    <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
                      {trailPolylines}
                    </svg>
                  ) : null}
                  {Object.entries(remoteCursors).map(([fromId, c]) => {
                    if (c.pageId && c.pageId !== activePageId) return null;
                    const { x, y } = sceneCoordsToViewportCoords({ sceneX: c.x, sceneY: c.y }, ps);
                    return (
                      <div
                        key={fromId}
                        className="absolute flex flex-col items-start"
                        style={{ transform: `translate(${x}px, ${y}px)`, marginTop: -8, marginLeft: 4 }}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-white/80 shadow"
                          style={{ backgroundColor: c.color }}
                        />
                        <span className="mt-0.5 max-w-36 truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {c.name}
                        </span>
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
        ) : null}
        {canWrite ? (
          <div
            className="pointer-events-auto absolute z-21 max-w-[min(18rem,calc(100vw-5rem))]"
            style={{
              top: "max(0.75rem, env(safe-area-inset-top, 0px))",
              right: "max(0.75rem, env(safe-area-inset-right, 0px))",
            }}
          >
            <button
              type="button"
              disabled={busy !== null}
              onClick={onToggleMagicInk}
              aria-pressed={magicInkUi}
              aria-label="Ink OCR pen — tap, then draw; stroke becomes text on pen-up"
              title={
                inkToTextOn
                  ? "Ink OCR — tap to arm, draw with the pen, release to convert to text. Tap again to turn off. The normal Excalidraw pen does not OCR."
                  : "Turn on “Magic ink (OCR)” in Apple Pencil settings (gear), then use this tool."
              }
              className={`glass-thick flex max-w-full items-center gap-2 rounded-2xl border border-(--glass-border) px-3 py-2 text-left text-xs font-semibold shadow-lg backdrop-blur-xl disabled:opacity-50 ${
                magicInkUi ? "bg-(--color-accent)/15 text-(--color-accent) ring-2 ring-(--color-accent)/40" : "text-(--text-primary)"
              } ${!inkToTextOn ? "opacity-60" : ""}`}
            >
              <Wand2 className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 leading-tight">
                <span className="block font-bold">Ink OCR</span>
                <span className="mt-0.5 block text-[10px] font-normal text-(--text-muted)">
                  {magicInkUi ? "On — draw to convert" : inkToTextOn ? "Tap to turn on" : "Enable in pencil settings"}
                </span>
              </span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-0 z-20">
        <div className="pointer-events-auto absolute bottom-24 right-3 w-[min(23rem,calc(100vw-1.5rem))] md:bottom-28 md:right-6">
          <div className="glass-thick rounded-3xl p-3">
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-black/5 dark:hover:bg-white/10"
              >
                <ChevronLeft className="h-5 w-5" />
              </Link>
              <input
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                readOnly={!canTitle}
                className="min-w-0 flex-1 rounded-xl bg-transparent px-2 py-2 text-sm font-semibold outline-none"
                placeholder="Untitled Note"
                spellCheck={false}
              />
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => void onManualSave()}
                  disabled={busy !== null || saveState === "saving"}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-(--color-accent) px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                  title="Save this note to the database now (same as autosave, but immediate)"
                >
                  <Save className="h-3.5 w-3.5" aria-hidden />
                  <span>Save now</span>
                </button>
              ) : null}
              <span
                className="inline-flex min-w-0 max-w-[min(14rem,42vw)] shrink-0 items-center gap-2 rounded-full bg-black/5 px-2 py-1 text-[11px] font-semibold dark:bg-white/10 md:max-w-[min(22rem,50vw)]"
                title={saveStateMeta.label}
                aria-live="polite"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${saveStateMeta.dotClass}`} />
                <span className="truncate">{saveStateMeta.label}</span>
              </span>
            </div>
            {membersGrouped.length > 0 ? (
              <div className="mt-2 flex max-w-full flex-wrap items-center gap-2 overflow-x-auto rounded-xl bg-black/5 px-2 py-1.5 dark:bg-white/10">
                {membersGrouped.map(([uid, group]) => (
                  <div key={uid} className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/5 px-2 py-1 dark:bg-white/10">
                    {group.length === 1 ? (
                      <>
                        <UserAvatar image={group[0]!.image} name={group[0]!.name} size="sm" />
                        {group[0]!.editing ? <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" title="Editing" /> : null}
                        <span className="text-xs font-semibold">{group[0]!.name}</span>
                      </>
                    ) : (
                      <>
                        {group.map((m) => (
                          <div key={m.fromSocketId} className="relative" title={m.name}>
                            <UserAvatar image={m.image} name={m.name} size="sm" />
                            {m.editing ? (
                              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full border border-(--bg-canvas) bg-emerald-500" />
                            ) : null}
                          </div>
                        ))}
                        <span className="text-xs font-semibold">{group[0]!.name} ({group.length})</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            {pendingMathSuggestion ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-black/5 px-2 py-1.5 text-[11px] dark:bg-white/10">
                <span className="min-w-0 flex-1 truncate" title={pendingMathSuggestion.original}>
                  {pendingMathSuggestion.expression} = {pendingMathSuggestion.result}
                </span>
                <button
                  type="button"
                  className="rounded-lg bg-(--color-accent) px-2 py-1 text-[10px] font-semibold text-white"
                  onClick={onInsertMathSuggestion}
                >
                  Insert
                </button>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-[10px] font-semibold hover:bg-black/10 dark:hover:bg-white/10"
                  onClick={() => setPendingMathSuggestion(null)}
                >
                  Dismiss
                </button>
              </div>
            ) : null}

            <div className="mt-2 border-t border-(--glass-border) pt-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={!canWrite || busy !== null}
                  onClick={() => pdfInputRef.current?.click()}
                  className="inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Import
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setShowExportModeDialog(true)}
                  className="inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
                >
                  <FileUp className="h-3.5 w-3.5" />
                  Export
                </button>
                <button
                  type="button"
                  onClick={onToggleExcalidrawTheme}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
                  aria-label="Toggle Excalidraw theme"
                >
                  {excalidrawTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => onZoomStep(-1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
                  aria-label="Zoom out"
                  title="Zoom out (helps on iPad when pinch does not zoom in pen mode)"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onZoomStep(1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
                  aria-label="Zoom in"
                  title="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onResetView}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
                  aria-label="Reset view"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPencilSettingsOpen(true)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
                  aria-label="Apple Pencil settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
                {showSharePanel ? (
                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
                    aria-label="Share"
                  >
                    <Users className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onDeletePage}
                  disabled={!canWrite || documentState.pages.length <= 1}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-500/20"
                  aria-label="Delete page"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void onClearNote()}
                  disabled={!canWrite || isClearing}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-500/20"
                  aria-label="Clear note"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex min-h-[38px] min-w-0 items-center gap-1 rounded-xl bg-black/5 px-1 dark:bg-white/10">
                <button
                  type="button"
                  disabled={documentState.pages.length <= 1}
                  onClick={() => {
                    const idx = documentState.pages.findIndex((page) => page.id === activePageId);
                    if (idx > 0) setActivePageId(documentState.pages[idx - 1].id);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/10 disabled:opacity-40 dark:hover:bg-white/10"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!activePage || !canWrite) return;
                    setRenamePageValue(activePage.name ?? DEFAULT_PAGE_NAME);
                    setRenamePageOpen(true);
                  }}
                  disabled={!canWrite}
                  className="min-w-0 flex-1 truncate rounded-lg px-2 py-1 text-left text-xs font-semibold hover:bg-black/10 dark:hover:bg-white/10"
                  title={activePage?.name ?? DEFAULT_PAGE_NAME}
                >
                  {activePage?.name ?? DEFAULT_PAGE_NAME}
                </button>
                <button
                  type="button"
                  disabled={documentState.pages.length <= 1}
                  onClick={() => {
                    const idx = documentState.pages.findIndex((page) => page.id === activePageId);
                    if (idx >= 0 && idx < documentState.pages.length - 1) setActivePageId(documentState.pages[idx + 1].id);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/10 disabled:opacity-40 dark:hover:bg-white/10"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onAddPage}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10"
                  aria-label="Add page"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {minimapView ? (
          <div className="pointer-events-none absolute bottom-24 left-4 hidden md:block">
            <div className="glass-panel relative h-28 w-44 overflow-hidden rounded-2xl border border-(--glass-border)">
              {minimapView.sceneRect ? (
                <div
                  className="absolute rounded-[6px] border border-emerald-500/80 bg-emerald-500/25"
                  style={{
                    left: `${minimapView.sceneRect.left}%`,
                    top: `${minimapView.sceneRect.top}%`,
                    width: `${Math.max(2, minimapView.sceneRect.width)}%`,
                    height: `${Math.max(2, minimapView.sceneRect.height)}%`,
                  }}
                />
              ) : null}
              <div
                className="absolute rounded-[6px] border-2 border-(--color-accent) bg-(--color-accent)/15"
                style={{
                  left: `${minimapView.viewportRect.left}%`,
                  top: `${minimapView.viewportRect.top}%`,
                  width: `${Math.max(4, minimapView.viewportRect.width)}%`,
                  height: `${Math.max(4, minimapView.viewportRect.height)}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        {!canWrite ? (
          <div className="pointer-events-auto absolute left-3 right-3 top-40 md:left-6 md:right-auto md:max-w-sm">
            <p className="glass-panel rounded-2xl border border-amber-500/35 px-4 py-2 text-center text-xs font-semibold text-amber-950 dark:text-amber-100">
              View only - editing disabled.
            </p>
          </div>
        ) : null}

        {showSharePanel ? (
          <CanvasShareSheet open={shareOpen} onClose={() => setShareOpen(false)} title="Share note">
            <SheetShareForm sheetId={sheetId} inviterName={userName} inviterImage={userImage} />
          </CanvasShareSheet>
        ) : null}

        {showImportModeDialog ? (
          <div className="pointer-events-auto fixed inset-0 z-100 flex items-center justify-center p-6">
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              onClick={() => {
                setShowImportModeDialog(false);
                setPendingPdfFile(null);
                pendingPdfFileRef.current = null;
              }}
              aria-hidden
            />
            <div
              className="relative z-1 w-full max-w-md touch-manipulation rounded-3xl border border-white/20 bg-[color-mix(in_srgb,var(--bg-surface)_95%,transparent)] p-6 shadow-2xl backdrop-blur-xl"
              onPointerDown={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="pdf-import-title"
            >
              <h3 id="pdf-import-title" className="text-base font-semibold">
                Import PDF
              </h3>
              <p className="mt-1 text-sm text-(--text-muted)">Choose how PDF pages should be placed in this note.</p>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  className="w-full touch-manipulation rounded-xl bg-black/5 px-3 py-2 text-left text-sm font-semibold hover:bg-black/10 active:bg-black/15 dark:bg-white/10 dark:hover:bg-white/15 dark:active:bg-white/20"
                  onClick={() => void runPdfImport("perPage")}
                >
                  Create one note page per PDF page
                </button>
                <button
                  type="button"
                  className="w-full touch-manipulation rounded-xl bg-black/5 px-3 py-2 text-left text-sm font-semibold hover:bg-black/10 active:bg-black/15 dark:bg-white/10 dark:hover:bg-white/15 dark:active:bg-white/20"
                  onClick={() => void runPdfImport("stackCurrent")}
                >
                  Stack all PDF pages on current page
                </button>
                <button
                  type="button"
                  className="w-full touch-manipulation rounded-xl bg-black/5 px-3 py-2 text-left text-sm font-semibold hover:bg-black/10 active:bg-black/15 dark:bg-white/10 dark:hover:bg-white/15 dark:active:bg-white/20"
                  onClick={() => void runPdfImport("stackNew")}
                >
                  Stack all PDF pages on a new note page
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {pencilSettingsOpen ? (
          <div className="pointer-events-auto fixed inset-0 flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setPencilSettingsOpen(false)} aria-hidden />
            <div className="relative w-full max-w-md rounded-3xl border border-white/20 bg-[color-mix(in_srgb,var(--bg-surface)_95%,transparent)] p-6 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">Apple Pencil settings</h3>
                <button
                  type="button"
                  className="rounded-xl px-3 py-1.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => setPencilSettingsOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-1.5 rounded-xl bg-black/5 px-2 py-2 dark:bg-white/10">
                <label className="flex flex-col gap-0.5 text-[11px] font-semibold">
                  <span className="text-(--text-muted)">Double-tap</span>
                  <select
                    className="rounded-lg border border-white/15 bg-transparent px-2 py-1 text-xs outline-none"
                    disabled={!canWrite}
                    value={pencilDoubleTapSetting}
                    onChange={(e) => {
                      const v = e.target.value as PencilDoubleTapAction;
                      setPencilDoubleTapAction(v);
                      setPencilDoubleTapSetting(v);
                    }}
                  >
                    <option value="toggleEraser">Toggle pen / eraser</option>
                    <option value="undo">Undo</option>
                    <option value="handwriting">Handwriting → text</option>
                    <option value="none">No action</option>
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!canWrite || busy !== null}
                  onClick={() => void openHandwritingModal()}
                  className="inline-flex min-h-[32px] items-center justify-center gap-1.5 rounded-xl bg-black/10 px-2 text-xs font-semibold hover:bg-black/15 disabled:opacity-50 dark:bg-white/15 dark:hover:bg-white/20"
                >
                  <PenLine className="h-3.5 w-3.5" />
                  Write → text
                </button>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold">
                  <input
                    type="checkbox"
                    checked={scribbleEraseOn}
                    disabled={!canWrite}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setScribbleEraseEnabled(on);
                      setScribbleEraseOn(on);
                    }}
                  />
                  Scribble erase gesture
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold">
                  <input
                    type="checkbox"
                    checked={inkToTextOn}
                    disabled={!canWrite}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setInkToTextModeEnabled(on);
                      setInkToTextOn(on);
                      if (!on) {
                        magicInkArmedRef.current = false;
                        setMagicInkUi(false);
                      }
                    }}
                  />
                  Magic ink (OCR) — allow the wand tool on the canvas bar
                </label>
                <p className="text-[10px] text-(--text-muted)">
                  Use the wand next to zoom to draw with freedraw and convert strokes to text. The normal Excalidraw pen does not run OCR.
                </p>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold">
                  <input
                    type="checkbox"
                    checked={inkMathSuggestOn}
                    disabled={!canWrite}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setInkMathSuggestionEnabled(on);
                      setInkMathSuggestOn(on);
                    }}
                  />
                  Equation suggestion after "="
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold">
                  <input
                    type="checkbox"
                    checked={useTesseractFallback}
                    disabled={!canWrite}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setUseTesseractFallback(on);
                      setUseTesseractFallbackState(on);
                    }}
                  />
                  Web fallback OCR: use Tesseract.js
                </label>
                <label className="flex flex-col gap-0.5 text-[11px] font-semibold">
                  <span className="text-(--text-muted)">OCR locale (default: hu-HU)</span>
                  <input
                    value={ocrLocale}
                    disabled={!canWrite}
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    className="rounded-lg border border-white/15 bg-transparent px-2 py-1 text-xs outline-none"
                    placeholder="hu-HU"
                    onChange={(e) => {
                      const next = e.target.value;
                      setOcrLocale(next);
                      setOcrLocaleState(next);
                    }}
                  />
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold">
                  <input
                    type="checkbox"
                    checked={pencilOnlyOn}
                    disabled={!canWrite}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setPencilOnlyInput(on);
                      setPencilOnlyOn(on);
                    }}
                  />
                  Pencil-only (block finger paint)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold">
                  <input
                    type="checkbox"
                    checked={excalidrawPenModeOn}
                    disabled={!canWrite}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setExcalidrawPenMode(on);
                      setExcalidrawPenModeOn(on);
                      const api = apiRef.current;
                      if (api) {
                        const cur = api.getAppState();
                        api.updateScene({
                          appState: { ...cur, penMode: on } as Parameters<
                            ExcalidrawImperativeApiLike["updateScene"]
                          >[0]["appState"],
                        });
                      }
                    }}
                  />
                  Excalidraw pen mode
                </label>
              </div>
            </div>
          </div>
        ) : null}

        {showExportModeDialog ? (
          <div className="pointer-events-auto fixed inset-0 flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setShowExportModeDialog(false)} aria-hidden />
            <div className="relative w-full max-w-md rounded-3xl border border-white/20 bg-[color-mix(in_srgb,var(--bg-surface)_95%,transparent)] p-6 shadow-2xl backdrop-blur-xl">
              <h3 className="text-base font-semibold">Export PDF</h3>
              <p className="mt-1 text-sm text-(--text-muted)">Export only the current page or the full note.</p>
              <div className="mt-4 space-y-2">
                <button type="button" className="w-full rounded-xl bg-black/5 px-3 py-2 text-left text-sm font-semibold hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15" onClick={() => void runPdfExport("current")}>
                  Export current page
                </button>
                <button type="button" className="w-full rounded-xl bg-black/5 px-3 py-2 text-left text-sm font-semibold hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15" onClick={() => void runPdfExport("all")}>
                  Export all note pages
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {renamePageOpen ? (
          <div className="pointer-events-auto fixed inset-0 flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setRenamePageOpen(false)} aria-hidden />
            <div className="relative w-full max-w-sm rounded-3xl border border-white/20 bg-[color-mix(in_srgb,var(--bg-surface)_95%,transparent)] p-6 shadow-2xl backdrop-blur-xl">
              <h3 className="text-base font-semibold">Rename page</h3>
              <input
                autoFocus
                value={renamePageValue}
                onChange={(e) => setRenamePageValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onRenamePage();
                  }
                }}
                className="mt-3 w-full rounded-xl border border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                placeholder="Page name"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-xl px-3 py-1.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setRenamePageOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={!renamePageValue.trim()}
                  onClick={onRenamePage}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {busy !== null ? (
          <div className="pointer-events-auto fixed inset-0 flex items-center justify-center p-6" role="alertdialog" aria-busy="true">
            <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" aria-hidden />
            <div className="relative w-full max-w-sm rounded-3xl border border-white/20 bg-[color-mix(in_srgb,var(--bg-surface)_95%,transparent)] px-8 py-10 text-center shadow-2xl backdrop-blur-xl">
              <Loader2 className="mx-auto mb-4 h-9 w-9 animate-spin text-(--color-accent)" />
              <p className="text-base font-semibold">{busyLabel}</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
