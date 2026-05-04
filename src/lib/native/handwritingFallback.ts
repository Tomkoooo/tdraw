import { getUseTesseractFallback } from "@/lib/native/pencilSettings";

export type InkFallbackResult = {
  text: string;
  provider: "none" | "http" | "tesseract";
};

function mapLocaleToTesseractLanguage(locale: string): string {
  const lc = locale.toLowerCase();
  if (lc.startsWith("hu")) return "hun";
  if (lc.startsWith("de")) return "deu";
  if (lc.startsWith("fr")) return "fra";
  if (lc.startsWith("es")) return "spa";
  if (lc.startsWith("it")) return "ita";
  if (lc.startsWith("pt")) return "por";
  return "eng";
}

async function recognizeWithTesseract(imageDataUrl: string, locale: string): Promise<InkFallbackResult> {
  const { createWorker } = await import("tesseract.js");
  const lang = mapLocaleToTesseractLanguage(locale);
  const worker = await createWorker(lang);
  try {
    await worker.setParameters({
      // Keep OCR raw; do not apply dictionary correction/autocorrect.
      tessedit_enable_dict_correction: "0",
      load_system_dawg: "0",
      load_freq_dawg: "0",
      preserve_interword_spaces: "1",
    });
    const { data } = await worker.recognize(imageDataUrl);
    return {
      text: (data.text ?? "").trim(),
      provider: "tesseract",
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Optional web/android fallback.
 * If `NEXT_PUBLIC_HANDWRITING_OCR_URL` is set, posts `{ imageDataUrl, locale }` and expects `{ text: string }`.
 */
export async function recognizeInkDataUrl(args: {
  imageDataUrl: string;
  locale?: string;
  signal?: AbortSignal;
}): Promise<InkFallbackResult> {
  if (getUseTesseractFallback()) {
    try {
      return await recognizeWithTesseract(args.imageDataUrl, args.locale ?? "hu-HU");
    } catch {
      // If local OCR fails, fall through to HTTP endpoint (if configured).
    }
  }

  const endpoint = process.env.NEXT_PUBLIC_HANDWRITING_OCR_URL?.trim();
  if (!endpoint) return { text: "", provider: "none" };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      imageDataUrl: args.imageDataUrl,
      locale: args.locale ?? "en-US",
    }),
    signal: args.signal,
  });
  if (!res.ok) return { text: "", provider: "http" };
  const payload = (await res.json()) as { text?: unknown };
  return {
    text: typeof payload.text === "string" ? payload.text : "",
    provider: "http",
  };
}

/** Kept for compatibility with older hook code paths. */
export async function recognizeHandwritingFromPoints(
  _points: ReadonlyArray<{ x: number; y: number }>,
): Promise<string | null> {
  return null;
}

export async function loadHandwritingFallbackModule(): Promise<typeof import("./handwritingFallback")> {
  return import("./handwritingFallback");
}
