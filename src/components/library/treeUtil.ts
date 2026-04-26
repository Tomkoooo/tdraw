import type { FolderRow } from "@/components/dashboard/driveTypes";
import type { FolderTreeEntry } from "@/lib/actions/folder";

type Row = { _id: string; name: string; parentFolderId: string | null };

export function toRows(tree: (FolderRow | FolderTreeEntry)[]): Row[] {
  return tree.map((t) => ({ _id: t._id, name: t.name, parentFolderId: t.parentFolderId ?? null }));
}

export function childrenMap(rows: Row[]) {
  const by = new Map<string | null, Row[]>();
  for (const r of rows) {
    const p = r.parentFolderId ?? null;
    if (!by.has(p)) by.set(p, []);
    by.get(p)!.push(r);
  }
  for (const list of by.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return by;
}

export function pathToFolder(folderId: string, rows: Row[]) {
  const byId = new Map(rows.map((r) => [r._id, r]));
  const out: { id: string; label: string }[] = [];
  let cur: string | null = folderId;
  const guard = new Set<string>();
  while (cur && byId.has(cur) && !guard.has(cur)) {
    guard.add(cur);
    const r: Row = byId.get(cur)!;
    out.unshift({ id: r._id, label: r.name });
    cur = r.parentFolderId;
  }
  return out;
}
