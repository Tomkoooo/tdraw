import type { Editor } from "tldraw";
import { PDFDocument } from "pdf-lib";

/**
 * Rasterizes each non-empty tldraw page to a PNG and builds a multi-page PDF.
 * Page order follows the editor's page list (same as the page menu).
 */
export async function exportEditorToPdf(editor: Editor, downloadBaseName: string) {
  const pdfDoc = await PDFDocument.create();
  const pages = editor.getPages();
  const resumePageId = editor.getCurrentPageId();

  for (const page of pages) {
    editor.setCurrentPage(page.id);
    if (editor.getCurrentPageShapeIds().size === 0) continue;

    const { blob } = await editor.toImage([], { format: "png", pixelRatio: 2 });
    const bytes = await blob.arrayBuffer();
    const image = await pdfDoc.embedPng(bytes);
    const pdfPage = pdfDoc.addPage([image.width, image.height]);
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }

  editor.setCurrentPage(resumePageId);

  if (pdfDoc.getPageCount() === 0) {
    throw new Error("No drawable pages to export (add content or import a PDF first).");
  }

  const out = await pdfDoc.save();
  const safe = downloadBaseName.replace(/[^\w\-]+/g, "_").slice(0, 80) || "note";
  const bytes = Uint8Array.from(out);
  const file = new File([bytes], `${safe}.pdf`, { type: "application/pdf" });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}
