/**
 * Defensive checks for realtime snapshot apply — bad or empty payloads must not wipe a live canvas.
 */

export function approxJsonBytes(value: unknown): number {
  try {
    if (value === undefined) return 0;
    const s = JSON.stringify(value);
    if (typeof s !== "string") return 0;
    return new Blob([s]).size;
  } catch {
    return 0;
  }
}

export function isValidContentVersion(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * When the current editor already holds a large document, ignore tiny payloads that are almost
 * certainly not a real TLDraw snapshot (common with malformed or partial socket payloads).
 */
export function shouldRejectRemoteSnapshotAsLikelyCorrupt(
  incoming: unknown,
  current: unknown,
  opts: { minIncomingBytes: number; minCurrentBytesToProtect: number } = {
    minIncomingBytes: 160,
    minCurrentBytesToProtect: 2400,
  }
): boolean {
  const inB = approxJsonBytes(incoming);
  const curB = approxJsonBytes(current);
  if (curB < opts.minCurrentBytesToProtect) return false;
  return inB < opts.minIncomingBytes;
}
