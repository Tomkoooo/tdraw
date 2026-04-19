import type { Editor } from "tldraw";
import { PageRecordType, createShapesForAssets } from "tldraw";

let workerConfigured = false;

function ensurePdfWorker(pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs")) {
  if (workerConfigured || typeof window === "undefined") return;
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
  workerConfigured = true;
}

const MAX_PAGE_PX = 2400;

/**
 * Adds one tldraw page per PDF page with the page rasterized as a background image.
 * Uses the built-in page menu for rename / reorder / delete after import.
 *
 * Uses the pdf.js **legacy** bundle so `Uint8Array.prototype.toHex` and related
 * Stage-4 helpers are polyfilled (the default build assumes a very new runtime).
 */
export async function importPdfToEditor(editor: Editor, file: File) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  ensurePdfWorker(pdfjs);

  const buf = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const baseName = file.name.replace(/\.pdf$/i, "") || "PDF";

  const viewportCenter = editor.getViewportPageBounds().center;

  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.getPage(i + 1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_PAGE_PX / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    );
    if (!blob) continue;

    const imageFile = new File([blob], `${baseName}-p${i + 1}.png`, { type: "image/png" });
    const asset = await editor.getAssetForExternalContent({ type: "file", file: imageFile });
    if (!asset) continue;

    const pageId = PageRecordType.createId();
    editor.createPage({ id: pageId, name: `${baseName} ${i + 1}` });
    editor.setCurrentPage(pageId);
    await createShapesForAssets(editor, [asset], viewportCenter);
  }

  pdf.destroy();
}
