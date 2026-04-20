import { PDFDocument } from "pdf-lib";

type ExcalidrawForExport = {
  getSceneElements: () => readonly unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
};

export async function exportEditorToPdf(excalidrawAPI: ExcalidrawForExport, downloadBaseName: string) {
  const elements = excalidrawAPI.getSceneElements();
  if (elements.length === 0) {
    throw new Error("No drawable pages to export (add content first).");
  }

  const { exportToBlob } = await import("@excalidraw/excalidraw");

  const blob = await exportToBlob({
    elements,
    mimeType: "image/png",
    appState: {
      ...excalidrawAPI.getAppState(),
      exportBackground: true,
      exportWithDarkMode: false,
    },
    files: excalidrawAPI.getFiles(),
  });

  const pdfDoc = await PDFDocument.create();
  const bytes = await blob.arrayBuffer();
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
