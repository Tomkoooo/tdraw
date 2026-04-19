export const SHEET_VISIT_STORAGE_KEY = "tdraw:sheet-visits:v1";
const MAX_ENTRIES = 400;

export type SheetVisitEntry = { lastVisitMs: number; count: number };

type Stored = { v: 1; visits: Record<string, SheetVisitEntry> };

export function readSheetVisits(): Record<string, SheetVisitEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SHEET_VISIT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Stored> & { visits?: Record<string, unknown> };
    if (!parsed.visits || typeof parsed.visits !== "object") return {};
    const out: Record<string, SheetVisitEntry> = {};
    for (const [id, row] of Object.entries(parsed.visits)) {
      if (!id || !row || typeof row !== "object") continue;
      const o = row as { lastVisitMs?: number; count?: number };
      const lastVisitMs = typeof o.lastVisitMs === "number" ? o.lastVisitMs : 0;
      const count = typeof o.count === "number" && o.count > 0 ? o.count : 1;
      if (lastVisitMs > 0) out[id] = { lastVisitMs, count };
    }
    return out;
  } catch {
    return {};
  }
}

function writeVisits(visits: Record<string, SheetVisitEntry>) {
  const keys = Object.keys(visits);
  if (keys.length <= MAX_ENTRIES) {
    localStorage.setItem(SHEET_VISIT_STORAGE_KEY, JSON.stringify({ v: 1, visits } satisfies Stored));
    return;
  }
  const sorted = [...keys].sort((a, b) => visits[a].lastVisitMs - visits[b].lastVisitMs);
  const drop = sorted.length - MAX_ENTRIES;
  for (let i = 0; i < drop; i++) delete visits[sorted[i]!];
  localStorage.setItem(SHEET_VISIT_STORAGE_KEY, JSON.stringify({ v: 1, visits } satisfies Stored));
}

export function recordSheetVisit(sheetId: string) {
  if (typeof window === "undefined" || !sheetId) return;
  try {
    const visits = { ...readSheetVisits() };
    const prev = visits[sheetId];
    visits[sheetId] = {
      lastVisitMs: Date.now(),
      count: (prev?.count ?? 0) + 1,
    };
    writeVisits(visits);
    window.dispatchEvent(new Event("tdraw:sheet-visit"));
  } catch {
    // ignore quota / private mode
  }
}
