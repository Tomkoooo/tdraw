export type PencilDoubleTapAction = "toggleEraser" | "undo" | "handwriting" | "none";

const KEY_DOUBLE_TAP = "tdraw-pencil-double-tap";
const KEY_SCRIBBLE = "tdraw-pencil-scribble-erase";
const KEY_PENCIL_ONLY = "tdraw-pencil-only";
const KEY_EXCALIDRAW_PEN_MODE = "tdraw-excalidraw-pen-mode";
const KEY_INK_TO_TEXT_MODE = "tdraw-ink-to-text-mode";
const KEY_INK_MATH_SUGGEST = "tdraw-ink-math-suggest";
const KEY_OCR_LOCALE = "tdraw-ocr-locale";
const KEY_OCR_USE_TESSERACT = "tdraw-ocr-use-tesseract";

export function getPencilDoubleTapAction(): PencilDoubleTapAction {
  if (typeof window === "undefined") return "toggleEraser";
  const v = window.localStorage.getItem(KEY_DOUBLE_TAP);
  if (v === "undo" || v === "handwriting" || v === "none" || v === "toggleEraser") return v;
  return "toggleEraser";
}

export function setPencilDoubleTapAction(action: PencilDoubleTapAction): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_DOUBLE_TAP, action);
}

export function getScribbleEraseEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY_SCRIBBLE) === "1";
}

export function setScribbleEraseEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_SCRIBBLE, on ? "1" : "0");
}

export function getPencilOnlyInput(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY_PENCIL_ONLY) === "1";
}

export function setPencilOnlyInput(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_PENCIL_ONLY, on ? "1" : "0");
}

/** Excalidraw appState `penMode` — prefer stylus for drawing (helps palm rejection). */
export function getExcalidrawPenMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY_EXCALIDRAW_PEN_MODE) === "1";
}

export function setExcalidrawPenMode(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_EXCALIDRAW_PEN_MODE, on ? "1" : "0");
}

/** When enabled, completed freedraw strokes are candidates for OCR conversion into text elements. */
export function getInkToTextModeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY_INK_TO_TEXT_MODE) === "1";
}

export function setInkToTextModeEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_INK_TO_TEXT_MODE, on ? "1" : "0");
}

/** If true, evaluate recognized equations and show a non-destructive suggestion chip. */
export function getInkMathSuggestionEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(KEY_INK_MATH_SUGGEST);
  // Default on so users discover the feature after enabling ink-to-text.
  return raw !== "0";
}

export function setInkMathSuggestionEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_INK_MATH_SUGGEST, on ? "1" : "0");
}

/** OCR locale used by handwriting conversion. Defaults to Hungarian. */
export function getOcrLocale(): string {
  if (typeof window === "undefined") return "hu-HU";
  const raw = window.localStorage.getItem(KEY_OCR_LOCALE)?.trim();
  if (!raw) return "hu-HU";
  return raw;
}

export function setOcrLocale(locale: string): void {
  if (typeof window === "undefined") return;
  const next = locale.trim() || "hu-HU";
  window.localStorage.setItem(KEY_OCR_LOCALE, next);
}

/** If true and no native OCR is available, run local Tesseract.js in the browser. */
export function getUseTesseractFallback(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY_OCR_USE_TESSERACT) === "1";
}

export function setUseTesseractFallback(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_OCR_USE_TESSERACT, on ? "1" : "0");
}
