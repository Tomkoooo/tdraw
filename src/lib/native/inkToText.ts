import type { ExcalidrawImperativeApiLike } from "@/components/canvas/ExcalidrawCanvas";
import { loadHandwritingFallbackModule } from "@/lib/native/handwritingFallback";
import { PencilEnhanced } from "@/lib/native/pencilEnhanced";

type RawElement = Record<string, unknown>;

export type InkBBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export function elementInkBBox(el: RawElement, padding = 12): InkBBox {
  const x = typeof el.x === "number" ? el.x : 0;
  const y = typeof el.y === "number" ? el.y : 0;
  const w = typeof el.width === "number" ? el.width : 0;
  const h = typeof el.height === "number" ? el.height : 0;
  const left = Math.min(x, x + w) - padding;
  const top = Math.min(y, y + h) - padding;
  const right = Math.max(x, x + w) + padding;
  const bottom = Math.max(y, y + h) + padding;
  return {
    minX: left,
    minY: top,
    maxX: right,
    maxY: bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("file_read_failed"));
    fr.onload = () => resolve(String(fr.result ?? ""));
    fr.readAsDataURL(blob);
  });
}

/**
 * Render only one element to a tightly cropped PNG for OCR.
 * Uses Excalidraw export pipeline to preserve stroke fidelity.
 */
export async function renderInkElementPatch(
  api: ExcalidrawImperativeApiLike,
  element: RawElement,
  opts?: { padding?: number; scale?: number },
): Promise<{ dataUrl: string; bbox: InkBBox }> {
  const bbox = elementInkBBox(element, opts?.padding ?? 14);
  const scale = opts?.scale ?? 3;
  const { exportToBlob } = await import("@excalidraw/excalidraw");
  const files = api.getFiles() as unknown as Record<string, unknown>;

  const blob = await exportToBlob({
    elements: [element],
    mimeType: "image/png",
    appState: {
      viewBackgroundColor: "#ffffff",
      exportBackground: true,
      exportWithDarkMode: false,
      exportPadding: 0,
      cropToContent: true,
      exportScale: scale,
      scrollX: -bbox.minX,
      scrollY: -bbox.minY,
      zoom: { value: 1 },
    },
    files,
  });
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, bbox };
}

export async function recognizeInkPatch(
  dataUrl: string,
  locale: string,
): Promise<{ text: string; provider: "ios-native" | "web-fallback" }> {
  try {
    const { text } = await PencilEnhanced.recognizeInkImage({
      imageBase64: dataUrl,
      locale,
    });
    if (text.trim()) return { text, provider: "ios-native" };
  } catch {
    // Fall back below.
  }
  const web = await loadHandwritingFallbackModule();
  const { text } = await web.recognizeInkDataUrl({
    imageDataUrl: dataUrl,
    locale,
  });
  return { text, provider: "web-fallback" };
}

