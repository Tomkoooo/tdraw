"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, MoreHorizontal, Pencil, Pin, PinOff, Share2, Trash2 } from "lucide-react";
import { moveSheetToTrash, setSheetPinned, updateSheetTitle } from "@/lib/actions/sheet";
import { useRouter } from "next/navigation";
import SheetShareForm from "@/components/SheetShareForm";
import SheetInfoModal from "@/components/dashboard/SheetInfoModal";
import type { SheetCard } from "@/components/dashboard/driveTypes";

export function useSheetCardMenuVisibility(
  sheet: SheetCard,
  opts: { variant: "personal" | "org" | "sharedByMe"; currentUserId: string; orgRole?: string }
) {
  if (opts.variant === "personal" || opts.variant === "sharedByMe") return true;
  if (opts.variant === "org") {
    const mine = sheet.userId && sheet.userId === opts.currentUserId;
    const admin = opts.orgRole === "admin";
    return !!(mine || admin);
  }
  return false;
}

export default function SheetCardMenu({
  sheet,
  variant,
  currentUserId,
  orgRole,
  inviterName,
  inviterImage,
}: {
  sheet: SheetCard;
  variant: "personal" | "org" | "sharedByMe";
  currentUserId: string;
  orgRole?: string;
  inviterName?: string | null;
  inviterImage?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [renameVal, setRenameVal] = useState(sheet.title);
  const btnRef = useRef<HTMLButtonElement>(null);

  const visible = useSheetCardMenuVisibility(sheet, { variant, currentUserId, orgRole });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!visible) return null;

  const onPin = async () => {
    try {
      await setSheetPinned(sheet._id, !sheet.pinned);
      setOpen(false);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  };

  const onTrash = async () => {
    if (!confirm(`Move “${sheet.title}” to Trash?`)) return;
    try {
      await moveSheetToTrash(sheet._id);
      setOpen(false);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  };

  const onRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSheetTitle(sheet._id, renameVal);
      setRenameOpen(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <>
      <div className="relative z-20">
        <button
          ref={btnRef}
          type="button"
          onClick={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            setOpen((o) => !o);
          }}
          className="rounded-xl bg-black/40 p-2 text-white backdrop-blur-md dark:bg-white/25"
          aria-label="Note actions"
          aria-expanded={open}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {open ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close"
              onClick={() => setOpen(false)}
            />
            <div
              className="glass-menu absolute right-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden rounded-2xl py-1.5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-black/6 dark:hover:bg-white/10"
                onClick={() => {
                  setRenameVal(sheet.title);
                  setRenameOpen(true);
                  setOpen(false);
                }}
              >
                <Pencil className="h-4 w-4 opacity-70" />
                Rename
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-black/6 dark:hover:bg-white/10"
                onClick={() => {
                  setShareOpen(true);
                  setOpen(false);
                }}
              >
                <Share2 className="h-4 w-4 opacity-70" />
                Share
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-black/6 dark:hover:bg-white/10"
                onClick={() => void onPin()}
              >
                {sheet.pinned ? <PinOff className="h-4 w-4 opacity-70" /> : <Pin className="h-4 w-4 opacity-70" />}
                {sheet.pinned ? "Unpin" : "Pin"}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-black/6 dark:hover:bg-white/10"
                onClick={() => {
                  setInfoOpen(true);
                  setOpen(false);
                }}
              >
                <Info className="h-4 w-4 opacity-70" />
                Information
              </button>
              <div className="my-1 border-t border-white/15 dark:border-white/10" />
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400"
                onClick={() => void onTrash()}
              >
                <Trash2 className="h-4 w-4 opacity-80" />
                Move to Trash
              </button>
            </div>
          </>
        ) : null}
      </div>

      {typeof document !== "undefined" && shareOpen
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
              <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShareOpen(false)} />
              <div className="glass-menu relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.75rem] p-6 shadow-2xl">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-bold tracking-tight">Share note</h2>
                  <button
                    type="button"
                    className="rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => setShareOpen(false)}
                  >
                    Done
                  </button>
                </div>
                <SheetShareForm sheetId={sheet._id} inviterName={inviterName} inviterImage={inviterImage} />
              </div>
            </div>,
            document.body
          )
        : null}

      {typeof document !== "undefined" && renameOpen
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setRenameOpen(false)} />
              <form
                onSubmit={(e) => void onRenameSubmit(e)}
                className="glass-menu relative z-10 w-full max-w-sm rounded-[1.75rem] p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="mb-3 text-lg font-bold">Rename</h2>
                <input
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  className="mb-4 w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => setRenameOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white">
                    Save
                  </button>
                </div>
              </form>
            </div>,
            document.body
          )
        : null}

      <SheetInfoModal sheetId={infoOpen ? sheet._id : null} open={infoOpen} onClose={() => setInfoOpen(false)} />
    </>
  );
}
