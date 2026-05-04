import type { ExcalidrawImperativeApiLike } from "@/components/canvas/ExcalidrawCanvas";

type ToolLike = { type: string; customType: string | null; lastActiveTool?: unknown; locked?: boolean };

function getActiveTool(api: ExcalidrawImperativeApiLike): ToolLike {
  const app = api.getAppState() as unknown as { activeTool?: ToolLike };
  const at = app.activeTool;
  return at ?? { type: "freedraw", customType: null, lastActiveTool: null, locked: false };
}

/** Switch to freedraw when the imperative API exposes `setActiveTool`. */
export function setActiveToolFreedraw(api: ExcalidrawImperativeApiLike): void {
  const set = (api as unknown as { setActiveTool?: (t: { type: string; customType: null }) => void }).setActiveTool;
  if (typeof set === "function") {
    set({ type: "freedraw", customType: null });
    return;
  }
  const at = getActiveTool(api);
  api.updateScene({
    appState: {
      activeTool: {
        ...at,
        type: "freedraw",
        customType: null,
      },
    } as Parameters<ExcalidrawImperativeApiLike["updateScene"]>[0]["appState"],
  });
}

/** Toggle between freedraw (pen) and eraser using the imperative API when available. */
export function togglePenEraser(api: ExcalidrawImperativeApiLike): void {
  const set = (api as unknown as { setActiveTool?: (t: { type: string; customType: null }) => void }).setActiveTool;
  const at = getActiveTool(api);
  if (typeof set === "function") {
    if (at.type === "eraser") {
      set({ type: "freedraw", customType: null });
    } else {
      set({ type: "eraser", customType: null });
    }
    return;
  }
  const nextType = at.type === "eraser" ? "freedraw" : "eraser";
  api.updateScene({
    appState: {
      activeTool: {
        ...at,
        type: nextType,
        customType: null,
      },
    } as Parameters<ExcalidrawImperativeApiLike["updateScene"]>[0]["appState"],
  });
}

/** Best-effort undo via keyboard shortcut (Excalidraw listens globally). */
export function triggerExcalidrawUndo(): void {
  if (typeof window === "undefined") return;
  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const ev = new KeyboardEvent("keydown", {
    key: "z",
    code: "KeyZ",
    bubbles: true,
    cancelable: true,
    metaKey: isMac,
    ctrlKey: !isMac,
  });
  window.dispatchEvent(ev);
}
