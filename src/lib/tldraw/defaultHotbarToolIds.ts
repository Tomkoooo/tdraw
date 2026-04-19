/**
 * Static list of default tldraw tool ids (must match `defaultTools` + `defaultShapeTools` order in tldraw).
 * Kept separate from `toolRegistry.ts` so server components (e.g. Settings) never import the tldraw bundle.
 */
export const ALL_DEFAULT_HOTBAR_TOOL_IDS = [
  "eraser",
  "hand",
  "laser",
  "zoom",
  "select",
  "text",
  "draw",
  "geo",
  "note",
  "line",
  "frame",
  "arrow",
  "highlight",
] as const;
