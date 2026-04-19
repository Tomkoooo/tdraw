/**
 * Maps persisted hotbar tool ids to tldraw tool classes.
 * Extend when new default tools ship — keep ids aligned with `Tool.id` statics.
 */
import { defaultTools, defaultShapeTools } from "tldraw";
import { ALL_DEFAULT_HOTBAR_TOOL_IDS } from "./defaultHotbarToolIds";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const all: any[] = [...defaultTools, ...defaultShapeTools];

const byId = new Map<string, unknown>();
for (const T of all) {
  byId.set(T.id, T);
}

export const ALL_HOTBAR_TOOL_IDS = [...ALL_DEFAULT_HOTBAR_TOOL_IDS];

/** Subset of tools for `<Tldraw tools={...} />`, or `undefined` to use full defaults. */
export function toolsForHotbarPreference(ids: string[] | undefined | null) {
  if (!ids || ids.length === 0) return undefined;
  const out: unknown[] = [];
  for (const id of ids) {
    const T = byId.get(id);
    if (T) out.push(T);
  }
  return out.length ? out : undefined;
}
