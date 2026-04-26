type BinaryFileData = {
  id: string;
  dataURL: string;
  mimeType: string;
  created: number;
  lastRetrieved?: number;
};

type ExcalidrawImageElement = {
  type: "image";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fileId: string;
  status: "saved";
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: null;
  updated: number;
  link: null;
  locked: boolean;
  opacity: number;
  groupIds: string[];
  frameId: null;
  roundness: null;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: "solid";
  strokeWidth: number;
  strokeStyle: "solid";
  roughness: number;
  isStrokeDisabled: boolean;
  isBackgroundDisabled: boolean;
  isCropLocked: boolean;
  crop: null;
};

type ExcalidrawForImport = {
  getSceneElements: () => ReadonlyArray<{ x: number; y: number; width: number; height: number }>;
  addFiles: (files: BinaryFileData[]) => void;
  updateScene: (scene: { elements: ReadonlyArray<{ [key: string]: unknown }> }) => void;
};

let workerConfigured = false;

function ensurePdfWorker(pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs")) {
  if (workerConfigured || typeof window === "undefined") return;
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
  workerConfigured = true;
}

const MAX_PAGE_PX = 2400;
const PAGE_GAP = 50;

function toImageElement(fileId: string, id: string, width: number, height: number, y: number): ExcalidrawImageElement {
  const now = Date.now();
  return {
    type: "image",
    id,
    x: 0,
    y,
    width,
    height,
    fileId,
    status: "saved",
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    locked: true,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    isStrokeDisabled: true,
    isBackgroundDisabled: false,
    isCropLocked: false,
    crop: null,
  };
}

export type PdfImportedPage = {
  file: BinaryFileData;
  imageElement: ExcalidrawImageElement;
};

export async function renderPdfToPages(file: File): Promise<PdfImportedPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  ensurePdfWorker(pdfjs);

  const buf = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const importedPages: PdfImportedPage[] = [];

  for (let i = 0; i < pdf.numPages; i++) {
    const now = Date.now();
    const page = await pdf.getPage(i + 1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_PAGE_PX / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;

    const dataURL = canvas.toDataURL("image/png");
    const fileId = `file-pdf-${now}-${i}`;
    const imageId = `img-${now}-${i}`;
    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);
    importedPages.push({
      file: {
      id: fileId,
      dataURL,
      mimeType: "image/png",
      created: now,
      lastRetrieved: now,
      },
      imageElement: toImageElement(fileId, imageId, width, height, 0),
    });
  }

  pdf.destroy();
  return importedPages;
}

export async function importPdfToEditor(excalidrawAPI: ExcalidrawForImport, file: File) {
  const importedPages = await renderPdfToPages(file);
  const currentElements = excalidrawAPI.getSceneElements();
  const nextElements = [...currentElements];
  const nextFiles: BinaryFileData[] = importedPages.map((page) => page.file);

  let currentY = 0;
  if (currentElements.length > 0) {
    const bottomElement = currentElements.reduce((prev, curr) =>
      curr.y + curr.height > prev.y + prev.height ? curr : prev,
    currentElements[0]);
    currentY = bottomElement.y + bottomElement.height + PAGE_GAP;
  }

  for (const importedPage of importedPages) {
    nextElements.push({
      ...importedPage.imageElement,
      y: currentY,
    });
    currentY += importedPage.imageElement.height + PAGE_GAP;
  }

  excalidrawAPI.addFiles(nextFiles);
  excalidrawAPI.updateScene({ elements: nextElements });
}
