"use client";

import { Tldraw, Editor, loadSnapshot, getSnapshot } from "tldraw";
import "tldraw/tldraw.css";
import { saveSheetState, updateSheetTitle } from "@/lib/actions/sheet";
import { importPdfToEditor } from "@/lib/pdf/importPdfToEditor";
import { exportEditorToPdf } from "@/lib/pdf/exportEditorToPdf";
import { ArrowLeft, ArrowRight, ChevronLeft, FileDown, FileUp, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface TldrawEditorProps {
  sheetId: string;
  initialData: unknown;
  title: string;
}

type BusyKind = "import" | "export";

export default function TldrawEditor({ sheetId, initialData, title: initialTitle }: TldrawEditorProps) {
  const router = useRouter();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [title, setTitle] = useState(initialTitle);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockSaveRef = useRef(false);
  const editorRef = useRef<Editor | null>(null);

  const [busy, setBusy] = useState<BusyKind | null>(null);
  const [pageTick, setPageTick] = useState(0);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    // Current page lives in instance scope, not document — document-only listener never fired on setCurrentPage.
    return editor.store.listen(
      () => {
        setPageTick((n) => n + 1);
      },
      { source: "all", scope: "all" }
    );
  }, [editor]);

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
      try {
        await updateSheetTitle(sheetId, next);
        router.refresh();
      } catch (e) {
        console.error(e);
      }
    },
    [sheetId, router]
  );

  const onTitleChange = (value: string) => {
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
    if (!ed || blockSaveRef.current) return;
    try {
      const snapshot = getSnapshot(ed.store);
      await saveSheetState(sheetId, snapshot);
    } catch (e) {
      console.error(e);
    }
  }, [sheetId]);

  const handleMount = useCallback(
    (ed: Editor) => {
      setEditor(ed);
      editorRef.current = ed;

      if (initialData && Object.keys(initialData).length > 0) {
        try {
          loadSnapshot(ed.store, initialData);
        } catch (e) {
          console.error("Failed to load initial data", e);
        }
      }

      let debounceTimer: ReturnType<typeof setTimeout>;
      ed.store.listen(
        () => {
          if (blockSaveRef.current) return;
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(async () => {
            if (blockSaveRef.current) return;
            try {
              const snapshot = getSnapshot(ed.store);
              await saveSheetState(sheetId, snapshot);
            } catch (error) {
              console.error("Failed to save sheet", error);
            }
          }, 1500);
        },
        { source: "user", scope: "document" }
      );
    },
    [sheetId, initialData]
  );

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
    if (!file || !editor) return;
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

  return (
    <div className="fixed inset-0 w-full h-full bg-[var(--bg-canvas)] flex flex-col pt-safe-top pb-safe-bottom overscroll-none">
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        disabled={busy !== null}
        onChange={onPickPdf}
      />

      <div className="relative flex min-h-0 flex-1 w-full">
        <Tldraw onMount={handleMount} inferDarkMode className="h-full w-full" />
      </div>

      {/* Rendered after canvas so stacking stays above tldraw without extra z-index */}
      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute left-6 top-[6.25rem] flex max-w-[min(100vw-2rem,28rem)] flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard"
              className="glass shrink-0 rounded-[1.2rem] border border-white/20 p-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-transform hover:bg-black/5 active:scale-90 dark:border-white/5 dark:hover:bg-white/10"
            >
              <ChevronLeft className="h-6 w-6 text-gray-800 dark:text-gray-200" />
            </Link>
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              onBlur={flushTitle}
              className="glass min-w-[10rem] max-w-[16rem] flex-1 rounded-[1.2rem] border border-white/20 px-5 py-3 text-[15px] font-semibold tracking-tight text-gray-900 shadow-[0_8px_30px_rgb(0,0,0,0.12)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 dark:border-white/5 dark:text-white sm:max-w-[20rem]"
              aria-label="Note title"
              spellCheck={false}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              disabled={busy !== null}
              className="glass inline-flex items-center gap-2 rounded-[1.1rem] border border-white/20 px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/5 dark:text-white dark:hover:bg-white/10"
            >
              <FileUp className="h-4 w-4 shrink-0" />
              <span>Import PDF</span>
            </button>
            <button
              type="button"
              onClick={() => void onExportPdf()}
              disabled={busy !== null}
              className="glass inline-flex items-center gap-2 rounded-[1.1rem] border border-white/20 px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/5 dark:text-white dark:hover:bg-white/10"
            >
              <FileDown className="h-4 w-4 shrink-0" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>

        {pageNav.total > 1 && (
          <div className="pointer-events-auto absolute bottom-[6.5rem] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[1.25rem] border border-white/25 bg-[color-mix(in_srgb,var(--bg-surface)_88%,transparent)] px-2 py-1.5 shadow-[0_8px_30px_rgb(0,0,0,0.14)] backdrop-blur-xl dark:border-white/10">
            <button
              type="button"
              aria-label="Previous page"
              disabled={pageNav.index <= 1 || busy !== null}
              onClick={() => goPage(-1)}
              className="rounded-xl p-2.5 text-gray-800 transition-colors hover:bg-black/10 disabled:opacity-35 dark:text-gray-100 dark:hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-[7.5rem] px-2 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Page {pageNav.index} / {pageNav.total}
              </div>
              {pageNav.name ? (
                <div className="max-w-[10rem] truncate text-xs font-medium text-gray-800 dark:text-gray-100">
                  {pageNav.name}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Next page"
              disabled={pageNav.index >= pageNav.total || busy !== null}
              onClick={() => goPage(1)}
              className="rounded-xl p-2.5 text-gray-800 transition-colors hover:bg-black/10 disabled:opacity-35 dark:text-gray-100 dark:hover:bg-white/10"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {busy !== null ? (
          <div
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
          border-radius: 2rem;
          overflow: hidden;
        }

        .tl-ui-toolbar {
          border-radius: 1.5rem !important;
          backdrop-filter: blur(20px) !important;
          background: color-mix(in srgb, var(--bg-surface) 80%, transparent) !important;
          border: 1px solid color-mix(in srgb, var(--color-text) 10%, transparent) !important;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12) !important;
          padding: 8px !important;
          margin-bottom: max(16px, env(safe-area-inset-bottom)) !important;
        }

        ::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
