"use client";

import { useCallback, useEffect, useRef } from "react";
import { viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import { PencilEnhanced } from "@/lib/native/pencilEnhanced";

import type { ExcalidrawImperativeApiLike } from "@/components/canvas/ExcalidrawCanvas";
import { getCapacitorPlatform, isCapacitorNative } from "@/lib/native/capacitor";
import { shouldAttemptInkOcr } from "@/lib/native/inkOcrHeuristics";
import { triggerExcalidrawUndo, togglePenEraser } from "@/lib/native/excalidrawPencilActions";
import { createHandwrittenTextElements, insertHandwrittenTextAtScenePoint } from "@/lib/native/handwritingToExcalidraw";
import { recognizeInkPatch, renderInkElementPatch } from "@/lib/native/inkToText";
import { maybeSuggestMathSolve, type MathSuggestion } from "@/lib/native/mathSuggestions";
import {
  getOcrLocale,
  getInkMathSuggestionEnabled,
  getInkToTextModeEnabled,
  getPencilDoubleTapAction,
  getScribbleEraseEnabled,
} from "@/lib/native/pencilSettings";
import { idsIntersectingStroke, isLikelyScribbleEraseStroke, type Point2 } from "@/lib/native/scribbleErase";

type PointerAppState = Parameters<typeof viewportCoordsToSceneCoords>[1];
type SceneElement = Record<string, unknown>;

export type UsePencilEnhancedArgs = {
  apiRef: React.MutableRefObject<ExcalidrawImperativeApiLike | null>;
  /** Increment when `excalidrawAPI` becomes ready so pointer hooks re-subscribe. */
  imperativeEpoch: number;
  canWrite: boolean;
  pointerAppState: (api: ExcalidrawImperativeApiLike) => PointerAppState;
  onMathSuggestion?: (suggestion: MathSuggestion & { x: number; y: number }) => void;
  /** While non-empty, these freedraw element ids are being converted to text (debounce + OCR). */
  onInkOcrPendingChange?: (elementIds: readonly string[]) => void;
  /** When true (e.g. “magic ink” armed), pen-up freedraw may run OCR if ink-to-text is enabled in settings. */
  inkOcrArmedRef: React.MutableRefObject<boolean>;
};

function toFinite(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function pointsFromFreedrawElement(el: SceneElement): Point2[] {
  const x = toFinite(el.x);
  const y = toFinite(el.y);
  const ptsRaw = Array.isArray(el.points) ? el.points : [];
  return ptsRaw
    .map((p: unknown) => {
      if (Array.isArray(p) && p.length >= 2) {
        return { x: x + Number(p[0]), y: y + Number(p[1]) };
      }
      return null;
    })
    .filter((p): p is Point2 => p !== null && Number.isFinite(p.x) && Number.isFinite(p.y));
}

export function usePencilEnhanced({
  apiRef,
  imperativeEpoch,
  canWrite,
  pointerAppState,
  onMathSuggestion,
  onInkOcrPendingChange,
  inkOcrArmedRef,
}: UsePencilEnhancedArgs) {
  const strokeRef = useRef<Point2[] | null>(null);
  const runDoubleTapActionRef = useRef<() => Promise<void>>(async () => {});
  const pendingInkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumps when a new ink OCR job is scheduled; stale async completions must not clear pending UI. */
  const inkOcrGenerationRef = useRef(0);

  const runDoubleTapAction = useCallback(async () => {
    const api = apiRef.current;
    if (!api || !canWrite) return;
    const action = getPencilDoubleTapAction();
    switch (action) {
      case "none":
        return;
      case "undo":
        triggerExcalidrawUndo();
        return;
      case "toggleEraser":
        togglePenEraser(api);
        return;
      case "handwriting":
        if (isCapacitorNative() && getCapacitorPlatform() === "ios") {
          try {
            const { text } = await PencilEnhanced.startHandwritingSession({
              locale: getOcrLocale(),
            });
            if (text.trim()) {
              const centerX = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
              const centerY = typeof window !== "undefined" ? window.innerHeight / 2 : 0;
              const ps = pointerAppState(api);
              const { x, y } = viewportCoordsToSceneCoords({ clientX: centerX, clientY: centerY }, ps);
              insertHandwrittenTextAtScenePoint(api, text, x, y);
            }
          } catch {
            /* user canceled modal */
          }
        }
        return;
      default:
        return;
    }
  }, [apiRef, canWrite, pointerAppState]);

  runDoubleTapActionRef.current = runDoubleTapAction;

  useEffect(() => {
    if (!canWrite) return;
    if (!isCapacitorNative() || getCapacitorPlatform() !== "ios") return;

    let remove: (() => Promise<void>) | undefined;

    void (async () => {
      const hTap = await PencilEnhanced.addListener("pencilDoubleTap", () => {
        void runDoubleTapActionRef.current();
      });
      const hSqueeze = await PencilEnhanced.addListener("pencilSqueeze", () => {
        /* Reserved for Apple Pencil Pro squeeze → custom actions when native emits. */
      });
      remove = async () => {
        await hTap.remove();
        await hSqueeze.remove();
      };
    })();

    return () => {
      void remove?.();
    };
  }, [canWrite]);

  useEffect(() => {
    if (!canWrite || typeof window === "undefined") return;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "pen") return;
      strokeRef.current = [{ x: e.clientX, y: e.clientY }];
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "pen" || !strokeRef.current) return;
      strokeRef.current.push({ x: e.clientX, y: e.clientY });
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "pen") return;
      strokeRef.current = null;
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
    };
  }, [canWrite]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !canWrite) return;

    const unsub = api.onPointerUp(async (_tool, _state, event) => {
      if (event.pointerType !== "pen" && event.pointerType !== "mouse") return;

      const els = api.getSceneElements() as unknown as Record<string, unknown>[];
      const last = els[els.length - 1];
      if (!last || last.type !== "freedraw" || Boolean(last.isDeleted)) return;

      const points = pointsFromFreedrawElement(last);

      if (getScribbleEraseEnabled() && isLikelyScribbleEraseStroke(points)) {
        const toRemove = new Set(idsIntersectingStroke(els, points));
        const strokeId = typeof last.id === "string" ? last.id : "";
        if (strokeId) toRemove.add(strokeId);

        if (toRemove.size === 0) return;
        const next = els.map((el) => {
          const id = typeof el.id === "string" ? el.id : "";
          if (toRemove.has(id)) {
            return { ...el, isDeleted: true };
          }
          return el;
        });
        api.updateScene({
          elements: next as unknown as Parameters<ExcalidrawImperativeApiLike["updateScene"]>[0]["elements"],
        });
        return;
      }

      if (!getInkToTextModeEnabled() || !inkOcrArmedRef.current) return;

      const strokeId = typeof last.id === "string" ? last.id : "";
      if (!strokeId) return;

      const boundsW = Math.abs(toFinite(last.width));
      const boundsH = Math.abs(toFinite(last.height));
      if (points.length < 6) return;
      if (boundsW < 4 && boundsH < 4) return;
      if (boundsW > 1800 || boundsH > 1800) return;
      if (!shouldAttemptInkOcr(points, boundsW, boundsH)) return;

      if (pendingInkTimerRef.current) {
        clearTimeout(pendingInkTimerRef.current);
        pendingInkTimerRef.current = null;
      }

      inkOcrGenerationRef.current += 1;
      const jobGen = inkOcrGenerationRef.current;
      const clearPendingIfCurrent = () => {
        if (jobGen === inkOcrGenerationRef.current) onInkOcrPendingChange?.([]);
      };

      onInkOcrPendingChange?.([strokeId]);

      pendingInkTimerRef.current = setTimeout(async () => {
        const apiNow = apiRef.current;
        if (!apiNow || !canWrite) {
          clearPendingIfCurrent();
          return;
        }
        const elementsNow = apiNow.getSceneElements() as unknown as SceneElement[];
        const src = elementsNow.find((el) => el.id === strokeId);
        if (!src || src.type !== "freedraw" || Boolean(src.isDeleted)) {
          clearPendingIfCurrent();
          return;
        }

        try {
          const locale = getOcrLocale();
          const { dataUrl, bbox } = await renderInkElementPatch(apiNow, src, { padding: 16, scale: 3 });
          const { text } = await recognizeInkPatch(dataUrl, locale);
          const trimmed = text.trim();
          if (!trimmed) return;

          const createdText = createHandwrittenTextElements(trimmed, bbox.centerX, bbox.centerY, {
            fontSize: Math.max(18, Math.min(42, bbox.height * 0.8)),
          });
          if (createdText.length === 0) return;

          const current = apiNow.getSceneElements() as unknown as SceneElement[];
          const merged = current.map((el) => (el.id === strokeId ? { ...el, isDeleted: true } : el));
          merged.push(...(createdText as unknown as SceneElement[]));
          apiNow.updateScene({
            elements: merged as unknown as Parameters<ExcalidrawImperativeApiLike["updateScene"]>[0]["elements"],
          });

          if (getInkMathSuggestionEnabled()) {
            const m = maybeSuggestMathSolve(trimmed);
            if (m) onMathSuggestion?.({ ...m, x: bbox.centerX, y: bbox.maxY + 24 });
          }
        } catch {
          // Do not block drawing if OCR fails.
        } finally {
          clearPendingIfCurrent();
        }
      }, 260);
    });

    return () => {
      if (pendingInkTimerRef.current) {
        clearTimeout(pendingInkTimerRef.current);
        pendingInkTimerRef.current = null;
      }
      inkOcrGenerationRef.current += 1;
      onInkOcrPendingChange?.([]);
      unsub();
    };
  }, [apiRef, canWrite, imperativeEpoch, onInkOcrPendingChange, onMathSuggestion]);

  const openHandwritingModal = useCallback(async () => {
    const api = apiRef.current;
    if (!api || !canWrite) return;
    if (!(isCapacitorNative() && getCapacitorPlatform() === "ios")) return;
    const centerX = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
    const centerY = typeof window !== "undefined" ? window.innerHeight / 2 : 0;
    try {
      const { text } = await PencilEnhanced.startHandwritingSession({
        locale: getOcrLocale(),
      });
      if (text.trim()) {
        const ps = pointerAppState(api);
        const { x, y } = viewportCoordsToSceneCoords({ clientX: centerX, clientY: centerY }, ps);
        insertHandwrittenTextAtScenePoint(api, text, x, y);
      }
    } catch {
      /* canceled */
    }
  }, [apiRef, canWrite, pointerAppState]);

  return { openHandwritingModal, runDoubleTapAction };
}
