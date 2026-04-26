import { PDFDocument } from "pdf-lib";

type ExcalidrawForExport = {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

async function exportPageToPngBytes(page: ExcalidrawForExport): Promise<ArrayBuffer> {
  const { exportToBlob } = await import("@excalidraw/excalidraw");
  const blob = await exportToBlob({
    elements: page.elements,
    mimeType: "image/png",
    appState: {
      ...page.appState,
      exportBackground: true,
      exportWithDarkMode: false,
    },
    files: page.files,
  });
  return blob.arrayBuffer();
}

export async function exportEditorToPdf(page: ExcalidrawForExport, downloadBaseName: string) {
  const elements = page.elements;
  if (elements.length === 0) {
    throw new Error("No drawable pages to export (add content first).");
  }

  const pdfDoc = await PDFDocument.create();
  const bytes = await exportPageToPngBytes(page);
  const image = await pdfDoc.embedPng(bytes);
  const pdfPage = pdfDoc.addPage([image.width, image.height]);
  pdfPage.drawImage(image, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height,
  });

  const out = await pdfDoc.save();
  const safe = downloadBaseName.replace(/[^\w\-]+/g, "_").slice(0, 80) || "note";
  const pdfBytes = Uint8Array.from(out);
  const file = new File([pdfBytes], `${safe}.pdf`, { type: "application/pdf" });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportPagesToPdf(pages: ExcalidrawForExport[], downloadBaseName: string) {
  if (!pages.length) throw new Error("No pages to export.");
  const drawablePages = pages.filter((page) => page.elements.length > 0);
  if (!drawablePages.length) throw new Error("No drawable pages to export (add content first).");

  const pdfDoc = await PDFDocument.create();
  for (const page of drawablePages) {
    const bytes = await exportPageToPngBytes(page);
    const image = await pdfDoc.embedPng(bytes);
    const pdfPage = pdfDoc.addPage([image.width, image.height]);
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }

  const out = await pdfDoc.save();
  const safe = downloadBaseName.replace(/[^\w\-]+/g, "_").slice(0, 80) || "note";
  const pdfBytes = Uint8Array.from(out);
  const file = new File([pdfBytes], `${safe}.pdf`, { type: "application/pdf" });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}
