import { create, all } from "mathjs";

const math = create(all, { number: "number", precision: 32 });

const SAFE_EXPR = /^[0-9+\-*/^().,\s=πpieEdeginscotanlogqrtabs]+$/i;

export type MathSuggestion = {
  original: string;
  expression: string;
  result: string;
};

function formatResult(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) {
    const s = String(v);
    if (s.length > 16) return v.toPrecision(12);
    return s;
  }
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  try {
    return math.format(v as Parameters<typeof math.format>[0], { precision: 14 });
  } catch {
    return String(v);
  }
}

/**
 * Finds simple "equation-like" input and returns a non-destructive suggestion.
 * Example: "12/3=" => { expression: "12/3", result: "4" }.
 */
export function maybeSuggestMathSolve(raw: string): MathSuggestion | null {
  const original = raw.trim();
  if (!original || !original.includes("=")) return null;
  if (!SAFE_EXPR.test(original)) return null;

  const idx = original.lastIndexOf("=");
  const expression = original.slice(0, idx).trim();
  if (!expression) return null;

  try {
    const out = math.evaluate(expression);
    const result = formatResult(out).trim();
    if (!result) return null;
    return { original, expression, result };
  } catch {
    return null;
  }
}

