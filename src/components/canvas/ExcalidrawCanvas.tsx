"use client";

import { Excalidraw } from "@excalidraw/excalidraw";
import type { ComponentProps } from "react";

type ExcalidrawPropsBase = ComponentProps<typeof Excalidraw>;
export type ExcalidrawImperativeApiLike = Parameters<NonNullable<ExcalidrawPropsBase["excalidrawAPI"]>>[0];

interface ExcalidrawCanvasProps extends ExcalidrawPropsBase {
  excalidrawAPI?: (api: ExcalidrawImperativeApiLike) => void;
}

export default function ExcalidrawCanvas(props: ExcalidrawCanvasProps) {
  const { excalidrawAPI, ...rest } = props;

  return (
    <Excalidraw {...rest} excalidrawAPI={excalidrawAPI} />
  );
}
