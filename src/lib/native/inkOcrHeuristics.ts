import type { Point2 } from "@/lib/native/scribbleErase";

/**
 * Skip OCR for strokes that look like closed shapes / dense loops rather than handwriting.
 * Handwritten letters can be loopy; rules aim at large tight outlines and scribble-blobs.
 */
export function shouldAttemptInkOcr(points: readonly Point2[], boundsW: number, boundsH: number): boolean {
  if (points.length < 8) return true;

  const bw = Math.abs(boundsW);
  const bh = Math.abs(boundsH);
  const span = Math.max(bw, bh, 1);
  const minSide = Math.max(Math.min(bw, bh), 1e-6);
  const aspect = span / minSide;

  let pathLen = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    pathLen += Math.hypot(b.x - a.x, b.y - a.y);
  }

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const gap = Math.hypot(last.x - first.x, last.y - first.y);

  // Very long thin stroke — divider / line, not a text block.
  if (aspect > 16 && points.length < 100) return false;

  // Tight closed outline: small gap vs span but long path (circle / blob / rounded rect doodle).
  if (points.length >= 28 && gap < span * 0.09 && pathLen > span * 4.8) return false;

  // Nearly closed + path winds a lot relative to span (dense loop / spiral scribble).
  if (points.length >= 36 && gap < span * 0.16 && pathLen / span > 6) return false;

  return true;
}
