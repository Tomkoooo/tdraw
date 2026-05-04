/**
 * Heuristic “scribble” stroke detection (tight self-crossing / direction reversals).
 * Not tied to Apple Pencil; runs wherever stroke points are available.
 */

export type Point2 = { x: number; y: number };

export function isLikelyScribbleEraseStroke(points: readonly Point2[], minPoints = 18): boolean {
  if (points.length < minPoints) return false;

  let reversals = 0;
  let totalLen = 0;
  for (let i = 2; i < points.length; i++) {
    const a = points[i - 2]!;
    const b = points[i - 1]!;
    const c = points[i]!;
    const v1 = { x: b.x - a.x, y: b.y - a.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const d1 = Math.hypot(v1.x, v1.y);
    const d2 = Math.hypot(v2.x, v2.y);
    if (d1 < 1e-6 || d2 < 1e-6) continue;
    totalLen += Math.hypot(c.x - b.x, c.y - b.y);
    const dot = (v1.x * v2.x + v1.y * v2.y) / (d1 * d2);
    if (dot < -0.35) reversals++;
  }

  if (reversals < 6 || totalLen < 40) return false;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const density = totalLen / span;
  return density > 2.8;
}

function segmentIntersectsRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const x1 = Math.min(ax, bx);
  const x2 = Math.max(ax, bx);
  const y1 = Math.min(ay, by);
  const y2 = Math.max(ay, by);
  if (x2 < rx || x1 > rx + rw || y2 < ry || y1 > ry + rh) return false;
  return true;
}

/** Returns ids of non-deleted drawable elements intersecting the polyline (bbox + segment test). */
export function idsIntersectingStroke(
  elements: readonly Record<string, unknown>[],
  points: readonly Point2[],
): string[] {
  if (points.length < 2) return [];
  const hits = new Set<string>();

  for (const el of elements) {
    if (Boolean(el.isDeleted)) continue;
    const id = typeof el.id === "string" ? el.id : "";
    if (!id) continue;
    const t = typeof el.type === "string" ? el.type : "";
    if (t !== "freedraw" && t !== "line" && t !== "arrow" && t !== "rectangle" && t !== "ellipse" && t !== "diamond") {
      continue;
    }
    const x = typeof el.x === "number" ? el.x : 0;
    const y = typeof el.y === "number" ? el.y : 0;
    const w = typeof el.width === "number" ? el.width : 0;
    const h = typeof el.height === "number" ? el.height : 0;
    const left = Math.min(x, x + w);
    const top = Math.min(y, y + h);
    const rw = Math.abs(w);
    const rh = Math.abs(h);

    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1]!;
      const p1 = points[i]!;
      if (segmentIntersectsRect(p0.x, p0.y, p1.x, p1.y, left, top, rw, rh)) {
        hits.add(id);
        break;
      }
    }
  }

  return [...hits];
}
