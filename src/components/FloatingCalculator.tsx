"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { create, all } from "mathjs";
import { Calculator, Copy, GripHorizontal, History, Minus } from "lucide-react";

const math = create(all, { number: "number", precision: 32 });

type FloatingCalculatorProps = {
  onCopyToCanvas?: (value: string) => void;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  fabBottomClass?: string;
  /** When true and the window is closed, no FAB is shown (e.g. global dock opens the calculator). */
  hideFabWhenClosed?: boolean;
};

type CalcTab = "calculator" | "history";
type CalcMode = "basic" | "science";

function formatResult(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) {
    const s = String(v);
    if (s.length > 16) return v.toPrecision(12);
    return s;
  }
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  try {
    return math.format(v as Parameters<typeof math.format>[0], { precision: 14 });
  } catch {
    return String(v);
  }
}

/** One row of the number pad — operators appear only here (no duplicate strip). */
const BASIC_KEYPAD_ROWS: readonly (readonly string[])[] = [
  ["(", ")", "^", "⌫"],
  ["7", "8", "9", "/"],
  ["4", "5", "6", "*"],
  ["1", "2", "3", "-"],
  ["0", ".", "π", "+"],
] as const;

const SCIENCE_INSERTS: readonly { label: string; value: string }[] = [
  { label: "√", value: "sqrt(" },
  { label: "sin", value: "sin(" },
  { label: "cos", value: "cos(" },
  { label: "tan", value: "tan(" },
  { label: "log", value: "log10(" },
  { label: "ln", value: "log(" },
  { label: "e", value: "e" },
  { label: "abs", value: "abs(" },
] as const;

type DragSession = { dx: number; dy: number; pointerId: number };
type ResizeSession = { startX: number; startY: number; w: number; h: number; pointerId: number };

function clampPosition(x: number, y: number, w: number, h: number) {
  if (typeof window === "undefined") return { x, y };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 48;
  const minX = -w + margin;
  const maxX = Math.max(minX, vw - w - margin);
  const minY = 8;
  const maxY = Math.max(minY, vh - h - margin);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

function clampSize(w: number, h: number, left: number, top: number) {
  if (typeof window === "undefined") return { w, h };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 12;
  const maxW = Math.max(252, vw - left - pad);
  const maxH = Math.max(304, vh - top - pad);
  return {
    w: Math.min(maxW, Math.max(252, w)),
    h: Math.min(maxH, Math.max(304, h)),
  };
}

export default function FloatingCalculator({
  onCopyToCanvas,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  fabBottomClass = "bottom-[7.5rem]",
  hideFabWhenClosed = false,
}: FloatingCalculatorProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (controlledOpen === undefined) setInternalOpen(v);
  };

  const [expr, setExpr] = useState("");
  const [result, setResult] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [tab, setTab] = useState<CalcTab>("calculator");
  const [mode, setMode] = useState<CalcMode>("basic");
  const [pos, setPos] = useState({ x: 120, y: 160 });
  const [size, setSize] = useState({ w: 288, h: 448 });
  const dragRegionRef = useRef<HTMLDivElement>(null);
  const resizeRegionRef = useRef<HTMLDivElement>(null);
  const dragSession = useRef<DragSession | null>(null);
  const resizeSession = useRef<ResizeSession | null>(null);
  const sizeRef = useRef(size);
  const posRef = useRef(pos);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    if (!open) return;
    const snapToViewport = () => {
      const { w, h } = sizeRef.current;
      const { x, y } = posRef.current;
      const nextPos = clampPosition(x, y, w, h);
      const nextSize = clampSize(w, h, nextPos.x, nextPos.y);
      setPos(nextPos);
      setSize(nextSize);
    };
    window.addEventListener("resize", snapToViewport);
    window.visualViewport?.addEventListener("resize", snapToViewport);
    return () => {
      window.removeEventListener("resize", snapToViewport);
      window.visualViewport?.removeEventListener("resize", snapToViewport);
    };
  }, [open]);

  const evaluateExpr = useCallback(() => {
    const raw = expr.trim();
    if (!raw) {
      setError(null);
      setResult("0");
      return;
    }
    try {
      const v = math.evaluate(raw);
      const out = formatResult(v);
      setResult(out);
      setError(null);
      setHistory((h) => [`${raw} = ${out}`, ...h].slice(0, 80));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid expression");
    }
  }, [expr]);

  const copyResult = async () => {
    const text = error ? "" : result;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      onCopyToCanvas?.(text);
    } catch {
      onCopyToCanvas?.(text);
    }
  };

  const insert = (snippet: string) => {
    setExpr((c) => (c ? `${c}${snippet}` : snippet));
  };

  const applyHistoryLine = (line: string) => {
    const head = line.split(" = ")[0] ?? line;
    setExpr(head);
    setTab("calculator");
  };

  const endDragPointer = useCallback((e: React.PointerEvent) => {
    const s = dragSession.current;
    if (!s || s.pointerId !== e.pointerId) return;
    dragSession.current = null;
    try {
      dragRegionRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  const onDragPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || e.button !== 0) return;
    const el = dragRegionRef.current;
    if (!el) return;
    e.preventDefault();
    const { x, y } = posRef.current;
    dragSession.current = { dx: e.clientX - x, dy: e.clientY - y, pointerId: e.pointerId };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      dragSession.current = null;
    }
  };

  const onDragPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragSession.current;
    if (!s || s.pointerId !== e.pointerId) return;
    e.preventDefault();
    const { w, h } = sizeRef.current;
    const nx = e.clientX - s.dx;
    const ny = e.clientY - s.dy;
    setPos(clampPosition(nx, ny, w, h));
  };

  const endResizePointer = useCallback((e: React.PointerEvent) => {
    const s = resizeSession.current;
    if (!s || s.pointerId !== e.pointerId) return;
    resizeSession.current = null;
    try {
      resizeRegionRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || e.button !== 0) return;
    const el = resizeRegionRef.current;
    if (!el) return;
    e.preventDefault();
    const { w, h } = sizeRef.current;
    resizeSession.current = {
      startX: e.clientX,
      startY: e.clientY,
      w,
      h,
      pointerId: e.pointerId,
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      resizeSession.current = null;
    }
  };

  const onResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = resizeSession.current;
    if (!s || s.pointerId !== e.pointerId) return;
    e.preventDefault();
    const dw = e.clientX - s.startX;
    const dh = e.clientY - s.startY;
    const { x, y } = posRef.current;
    const next = clampSize(s.w + dw, s.h + dh, x, y);
    setSize(next);
  };

  if (!open) {
    if (hideFabWhenClosed) return null;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`glass pointer-events-auto fixed right-6 z-[62] flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 shadow-lg dark:border-white/10 ${fabBottomClass}`}
        aria-label="Open calculator"
      >
        <Calculator className="h-6 w-6 text-[var(--color-accent)]" />
      </button>
    );
  }

  return (
    <div
      className="glass-menu pointer-events-auto fixed z-[90] flex flex-col overflow-hidden rounded-[1.35rem] border border-[var(--glass-border)] shadow-2xl"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h, minWidth: 252, minHeight: 304, touchAction: "manipulation" }}
    >
      <div className="flex shrink-0 items-stretch justify-between border-b border-white/15">
        <div
          ref={dragRegionRef}
          tabIndex={0}
          aria-label="Drag to move calculator"
          className="flex min-h-[48px] min-w-0 flex-1 cursor-grab touch-none select-none items-center gap-2 px-3 py-2 active:cursor-grabbing"
          style={{ touchAction: "none" }}
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={endDragPointer}
          onPointerCancel={endDragPointer}
          onLostPointerCapture={endDragPointer}
        >
          <GripHorizontal className="h-5 w-5 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
          <span className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">Calculator</span>
        </div>
        <button
          type="button"
          className="flex min-h-[48px] min-w-[48px] shrink-0 touch-manipulation items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => setOpen(false)}
          aria-label="Close"
        >
          <Minus className="h-5 w-5 rotate-45" />
        </button>
      </div>

      <div className="flex shrink-0 border-b border-white/10 px-2 pb-1.5 pt-1" role="tablist" aria-label="Calculator panels">
        <div className="flex w-full gap-1 rounded-xl bg-black/[0.06] p-0.5 dark:bg-white/[0.08]">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "calculator"}
            className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold ${
              tab === "calculator" ? "bg-white text-gray-900 shadow-sm dark:bg-white/20 dark:text-white" : "text-gray-600 dark:text-gray-400"
            }`}
            onClick={() => setTab("calculator")}
          >
            <Calculator className="h-3.5 w-3.5 opacity-80" />
            Calc
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "history"}
            className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold ${
              tab === "history" ? "bg-white text-gray-900 shadow-sm dark:bg-white/20 dark:text-white" : "text-gray-600 dark:text-gray-400"
            }`}
            onClick={() => setTab("history")}
          >
            <History className="h-3.5 w-3.5 opacity-80" />
            History
            {history.length > 0 ? (
              <span className="rounded-full bg-[var(--color-accent)]/20 px-1.5 text-[10px] font-bold text-[var(--color-accent)]">{history.length}</span>
            ) : null}
          </button>
        </div>
      </div>

      {tab === "calculator" ? (
        <>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-2.5 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Mode</span>
            <div className="flex rounded-lg bg-black/[0.06] p-0.5 dark:bg-white/[0.08]" role="group" aria-label="Calculator mode">
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${mode === "basic" ? "bg-white shadow-sm dark:bg-white/20" : "text-gray-600 dark:text-gray-400"}`}
                onClick={() => setMode("basic")}
              >
                Basic
              </button>
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${mode === "science" ? "bg-white shadow-sm dark:bg-white/20" : "text-gray-600 dark:text-gray-400"}`}
                onClick={() => setMode("science")}
              >
                Science
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
            <div className="mb-1.5 rounded-xl bg-black/40 px-2.5 py-1.5 text-right font-mono text-base font-semibold text-white backdrop-blur-md dark:bg-black/50">
              {error ? <span className="text-xs text-red-200">{error}</span> : result}
            </div>

            <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Expression</label>
            <textarea
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  evaluateExpr();
                }
              }}
              placeholder={
                mode === "basic"
                  ? "e.g. 12 * (4 + 3), 2^8"
                  : "e.g. sqrt(2) + sin(45 deg), integrate('x^2','x',0,1)"
              }
              rows={2}
              className="mb-1.5 w-full resize-none rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-2.5 py-1.5 font-mono text-xs"
              spellCheck={false}
            />

            <div className="mb-1.5 flex gap-1">
              <button
                type="button"
                className="min-h-[40px] flex-1 rounded-xl bg-[var(--color-accent)] text-xs font-bold text-white active:scale-[0.98]"
                onClick={() => evaluateExpr()}
              >
                =
              </button>
              <button
                type="button"
                className="min-h-[40px] flex-1 rounded-xl bg-black/10 text-xs font-semibold dark:bg-white/15"
                onClick={() => {
                  setExpr("");
                  setError(null);
                  setResult("0");
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl bg-black/10 dark:bg-white/15"
                onClick={() => void copyResult()}
                aria-label="Copy result"
                title="Copy result"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {BASIC_KEYPAD_ROWS.flatMap((row, ri) =>
                row.map((key) =>
                  key === "⌫" ? (
                    <button
                      key={`${ri}-bk`}
                      type="button"
                      className="min-h-[46px] rounded-xl bg-black/[0.07] text-base font-semibold active:scale-[0.97] dark:bg-white/[0.12]"
                      onClick={() => setExpr((c) => c.slice(0, -1))}
                    >
                      ⌫
                    </button>
                  ) : key === "π" ? (
                    <button
                      key={`${ri}-pi`}
                      type="button"
                      className="min-h-[46px] rounded-xl bg-black/[0.07] text-base font-bold active:scale-[0.97] dark:bg-white/[0.12]"
                      onClick={() => insert("pi")}
                    >
                      π
                    </button>
                  ) : (
                    <button
                      key={`${ri}-${key}`}
                      type="button"
                      className="min-h-[46px] rounded-xl bg-black/[0.07] text-base font-bold tracking-wide active:scale-[0.97] dark:bg-white/[0.12] dark:text-gray-100"
                      onClick={() => insert(key)}
                    >
                      {key}
                    </button>
                  )
                )
              )}
            </div>

            {mode === "science" ? (
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {SCIENCE_INSERTS.map(({ label, value }) => (
                  <button
                    key={label}
                    type="button"
                    className="min-h-[40px] rounded-xl bg-black/[0.05] text-[11px] font-semibold active:scale-[0.97] dark:bg-white/[0.10]"
                    onClick={() => insert(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            <p className="mt-1.5 text-[9px] leading-snug text-gray-500 dark:text-gray-400">
              math.js — radians default; use <code className="rounded bg-black/10 px-0.5">deg</code> for degrees. ⌘/Ctrl+Enter evaluates.
            </p>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          {history.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-500 dark:text-gray-400">No calculations yet. Run an expression on the Calc tab.</p>
          ) : (
            <ul className="space-y-1 font-mono text-[11px] text-gray-700 dark:text-gray-300">
              {history.map((h, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-transparent px-2 py-2 text-left hover:border-[var(--glass-border)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    onClick={() => applyHistoryLine(h)}
                  >
                    {h}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div
        ref={resizeRegionRef}
        tabIndex={0}
        aria-label="Drag corner to resize calculator"
        className="absolute bottom-0 right-0 flex h-[52px] w-[52px] cursor-nwse-resize touch-none select-none items-end justify-end"
        style={{ touchAction: "none" }}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={endResizePointer}
        onPointerCancel={endResizePointer}
        onLostPointerCapture={endResizePointer}
      >
        <svg
          className="pointer-events-none mb-1.5 mr-1.5 h-6 w-6 text-gray-500 opacity-50 dark:text-gray-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M21 21H10v-11h11V10H10V21" />
          <path d="M3 3h8v8H3z" />
        </svg>
      </div>
    </div>
  );
}
