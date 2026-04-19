"use client";

import { recordSheetVisit } from "@/lib/client/sheetVisitLog";
import { useEffect } from "react";

/** Records opens for dashboard “Recent” ranking (local only). */
export default function SheetVisitRecorder({ sheetId }: { sheetId: string }) {
  useEffect(() => {
    recordSheetVisit(sheetId);
  }, [sheetId]);
  return null;
}
