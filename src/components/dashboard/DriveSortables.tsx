"use client";

import type { ReactNode } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { Folder as FolderIcon, GripVertical, Pencil, Pin } from "lucide-react";
import { reorderMyDriveSheets } from "@/lib/actions/sheet";
import { reorderPersonalFolders, setFolderPinned } from "@/lib/actions/folder";
import { useRouter } from "next/navigation";
import SheetCardMenu from "@/components/dashboard/SheetCardMenu";
import type { FolderRow, SheetCard } from "@/components/dashboard/driveTypes";

export type { FolderRow, SheetCard } from "@/components/dashboard/driveTypes";

function SortableSheetCard({
  sheet,
  view,
  sheetMenu,
}: {
  sheet: SheetCard;
  view: "grid" | "list";
  sheetMenu?: {
    variant: "personal" | "org" | "sharedByMe";
    currentUserId: string;
    orgRole?: string;
    inviterName?: string | null;
    inviterImage?: string | null;
  };
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sheet._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 };

  if (view === "list") {
    return (
      <div ref={setNodeRef} style={style} className="glass-panel flex min-w-0 items-center gap-3 p-3 pr-2 animate-micro">
        <button
          type="button"
          className="touch-none rounded-xl p-2 text-gray-400 hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="Reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Link href={`/sheet/${sheet._id}`} className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-white/50 dark:bg-black/25">
            {sheet.previewImage ? (
              <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <Pencil className="h-5 w-5 text-gray-300 dark:text-gray-600" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">{sheet.title}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(sheet.updatedAt).toLocaleDateString()}
            </p>
          </div>
        </Link>
        {sheetMenu ? (
          <div className="shrink-0" onClick={(e) => e.preventDefault()}>
            <SheetCardMenu
              sheet={sheet}
              variant={sheetMenu.variant}
              currentUserId={sheetMenu.currentUserId}
              orgRole={sheetMenu.orgRole}
              inviterName={sheetMenu.inviterName}
              inviterImage={sheetMenu.inviterImage}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="relative aspect-[4/3] min-h-0 animate-micro">
      {sheetMenu ? (
        <div className="absolute left-2 top-2 z-10" onClick={(e) => e.preventDefault()}>
          <SheetCardMenu
            sheet={sheet}
            variant={sheetMenu.variant}
            currentUserId={sheetMenu.currentUserId}
            orgRole={sheetMenu.orgRole}
            inviterName={sheetMenu.inviterName}
            inviterImage={sheetMenu.inviterImage}
          />
        </div>
      ) : null}
      <button
        type="button"
        className="absolute right-2 top-2 z-10 touch-none rounded-xl bg-black/35 p-2 text-white backdrop-blur-md dark:bg-white/20"
        aria-label="Reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Link
        href={`/sheet/${sheet._id}`}
        className="glass-panel flex h-full flex-col overflow-hidden p-4 pt-11 shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99]"
      >
        <div className="mb-2 flex flex-1 items-center justify-center overflow-hidden rounded-2xl bg-white/45 dark:bg-black/20">
          {sheet.previewImage ? (
            <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
          ) : (
            <Pencil className="h-9 w-9 text-gray-300 dark:text-gray-600" />
          )}
        </div>
        <h3 className="truncate text-sm font-semibold">{sheet.title}</h3>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {new Date(sheet.updatedAt).toLocaleDateString()}
        </p>
      </Link>
    </div>
  );
}

function SortableFolderChip({ folder }: { folder: FolderRow }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: folder._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 };

  const togglePin = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await setFolderPinned(folder._id, !folder.pinned);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="glass inline-flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pl-2 pr-3 text-xs font-semibold animate-micro"
    >
      <button
        type="button"
        className="touch-none rounded-full p-1 text-gray-400 hover:bg-black/5 dark:hover:bg-white/10"
        aria-label={`Reorder ${folder.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <FolderIcon className="h-3.5 w-3.5 opacity-70" />
      <span>{folder.name}</span>
      <button
        type="button"
        onClick={(e) => void togglePin(e)}
        className={`rounded-full p-1 ${folder.pinned ? "text-[var(--color-accent)]" : "text-gray-400 hover:bg-black/5 dark:hover:bg-white/10"}`}
        aria-label={folder.pinned ? "Unpin folder" : "Pin folder"}
      >
        <Pin className={`h-3.5 w-3.5 ${folder.pinned ? "fill-current" : ""}`} />
      </button>
    </div>
  );
}

export function SortablePersonalFolders({
  folders,
  onOrderChange,
}: {
  folders: FolderRow[];
  onOrderChange: (next: FolderRow[]) => void;
}) {
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const ids = folders.map((f) => f._id);

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(folders, oldIndex, newIndex);
    onOrderChange(next);
    try {
      await reorderPersonalFolders(next.map((f) => f._id));
      router.refresh();
    } catch {
      onOrderChange(folders);
    }
  };

  if (folders.length === 0) return null;

  return (
    <DndContext
      id="tdraw-personal-folders"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(ev) => void onDragEnd(ev)}
    >
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <div className="flex flex-wrap gap-2">{folders.map((f) => <SortableFolderChip key={f._id} folder={f} />)}</div>
      </SortableContext>
    </DndContext>
  );
}

export function SortableMyDriveSheets({
  sheets,
  view,
  onOrderChange,
  prepend,
  sheetMenu,
}: {
  sheets: SheetCard[];
  view: "grid" | "list";
  onOrderChange: (next: SheetCard[]) => void;
  prepend?: ReactNode;
  sheetMenu?: {
    variant: "personal" | "org" | "sharedByMe";
    currentUserId: string;
    orgRole?: string;
    inviterName?: string | null;
    inviterImage?: string | null;
  };
}) {
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const ids = sheets.map((s) => s._id);

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(sheets, oldIndex, newIndex);
    onOrderChange(next);
    try {
      await reorderMyDriveSheets(next.map((s) => s._id));
      router.refresh();
    } catch {
      onOrderChange(sheets);
    }
  };

  const gridClass =
    view === "grid"
      ? "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
      : "flex flex-col gap-2";

  if (sheets.length === 0 && !prepend) return null;
  if (sheets.length === 0 && prepend) {
    return <div className={gridClass}>{prepend}</div>;
  }

  return (
    <DndContext
      id="tdraw-my-drive-sheets"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(ev) => void onDragEnd(ev)}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={gridClass}>
          {prepend}
          {sheets.map((s) => (
            <SortableSheetCard key={s._id} sheet={s} view={view} sheetMenu={sheetMenu} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
