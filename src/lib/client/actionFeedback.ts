"use client";

import { toast } from "sonner";

/**
 * Normalizes errors from server actions, fetch, or Next.js so UI can show a human-readable string.
 */
export function readActionErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.length > 0) return o.message;
    if (typeof o.digest === "string") return "The request failed. Try again or reload the page.";
  }
  return "Something went wrong. Please try again.";
}

export function toastActionError(err: unknown, opts?: { id?: string; duration?: number }) {
  toast.error(readActionErrorMessage(err), {
    id: opts?.id ?? "tdraw-action-error",
    duration: opts?.duration ?? 10_000,
  });
}

export function toastActionSuccess(message: string, opts?: { id?: string; description?: string; duration?: number }) {
  toast.success(message, {
    id: opts?.id,
    description: opts?.description,
    duration: opts?.duration ?? 4000,
  });
}
