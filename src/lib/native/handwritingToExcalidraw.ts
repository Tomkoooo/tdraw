import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

import type { ExcalidrawImperativeApiLike } from "@/components/canvas/ExcalidrawCanvas";

export type InsertHandwrittenTextOptions = {
  fontSize?: number;
};

export function createHandwrittenTextElements(
  text: string,
  sceneX: number,
  sceneY: number,
  opts?: InsertHandwrittenTextOptions,
) {
  const trimmed = text.trim();
  if (!trimmed) return [] as ReturnType<typeof convertToExcalidrawElements>;
  const fontSize = opts?.fontSize ?? 28;
  return convertToExcalidrawElements(
    [
      {
        type: "text" as const,
        text: trimmed,
        x: sceneX,
        y: sceneY,
        fontSize,
      },
    ],
    { regenerateIds: true },
  );
}

/** Appends a new Excalidraw text element at scene coordinates. */
export function insertHandwrittenTextAtScenePoint(
  api: ExcalidrawImperativeApiLike,
  text: string,
  sceneX: number,
  sceneY: number,
  opts?: InsertHandwrittenTextOptions,
): void {
  const created = createHandwrittenTextElements(text, sceneX, sceneY, opts);
  if (created.length === 0) return;

  const current = api.getSceneElements() as unknown as Record<string, unknown>[];
  const merged = [...current, ...(created as unknown as typeof current)];
  api.updateScene({
    elements: merged as unknown as Parameters<ExcalidrawImperativeApiLike["updateScene"]>[0]["elements"],
  });
}
