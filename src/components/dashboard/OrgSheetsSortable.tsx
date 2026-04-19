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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { GripVertical, Pencil } from "lucide-react";
import { reorderOrgSheets } from "@/lib/actions/sheet";
import { useRouter } from "next/navigation";
import SheetCardMenu from "@/components/dashboard/SheetCardMenu";
import type { SheetCard } from "@/components/dashboard/driveTypes";
import type { DocEditActivity } from "@/components/realtime/OrgWorkspaceRealtime";
import UserAvatar from "@/components/UserAvatar";

function EditingNow({ act }: { act: DocEditActivity }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)]">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-40" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-accent)]" />
      </span>
      <UserAvatar image={act.image} name={act.name} size="sm" className="!h-6 !w-6 !min-h-6 !min-w-6 text-[10px]" />
      <span className="min-w-0 truncate">{act.name}</span>
    </div>
  );
}

function SortableOrgSheet({
  sheet,
  view,
  currentUserId,
  orgRole,
  inviterName,
  inviterImage,
  editing,
}: {
  sheet: SheetCard;
  view: "grid" | "list";
  currentUserId: string;
  orgRole: string;
  inviterName?: string | null;
  inviterImage?: string | null;
  editing?: DocEditActivity | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sheet._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 };

  const sheetMenu = { variant: "org" as const, currentUserId, orgRole, inviterName, inviterImage };

  if (view === "list") {
    return (
      <div ref={setNodeRef} style={style} className="glass-panel flex items-center gap-3 p-3 animate-micro">
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
            <p className="text-xs text-gray-500">{new Date(sheet.updatedAt).toLocaleDateString()}</p>
            {editing ? (
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">Being edited</p>
            ) : null}
            {editing ? <div className="mt-1"><EditingNow act={editing} /></div> : null}
          </div>
        </Link>
        <div className="shrink-0" onClick={(e) => e.preventDefault()}>
          <SheetCardMenu sheet={sheet} {...sheetMenu} />
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="relative aspect-[4/3] animate-micro">
      <div className="absolute left-2 top-2 z-10" onClick={(e) => e.preventDefault()}>
        <SheetCardMenu sheet={sheet} {...sheetMenu} />
      </div>
      <button
        type="button"
        className="absolute right-2 top-2 z-10 touch-none rounded-xl bg-black/35 p-2 text-white backdrop-blur-md"
        aria-label="Reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Link
        href={`/sheet/${sheet._id}`}
        className="glass-panel flex h-full flex-col overflow-hidden p-4 pt-11 shadow-sm hover:scale-[1.01] active:scale-[0.99]"
      >
        <div className="mb-2 flex flex-1 items-center justify-center overflow-hidden rounded-2xl bg-white/45 dark:bg-black/20">
          {sheet.previewImage ? (
            <img src={sheet.previewImage} alt="" className="h-full w-full object-cover" />
          ) : (
            <Pencil className="h-9 w-9 text-gray-300 dark:text-gray-600" />
          )}
        </div>
        <h3 className="truncate text-sm font-semibold">{sheet.title}</h3>
        <p className="text-[10px] text-gray-500">{new Date(sheet.updatedAt).toLocaleDateString()}</p>
        {editing ? (
          <div className="mt-2 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Being edited now</p>
            <EditingNow act={editing} />
          </div>
        ) : null}
      </Link>
    </div>
  );
}

export default function OrgSheetsSortable({
  organizationId,
  sheets,
  view,
  onOrderChange,
  prepend,
  currentUserId,
  orgRole,
  inviterName,
  inviterImage,
  editingBySheet,
}: {
  organizationId: string;
  sheets: SheetCard[];
  view: "grid" | "list";
  onOrderChange: (next: SheetCard[]) => void;
  prepend?: ReactNode;
  currentUserId: string;
  orgRole: string;
  inviterName?: string | null;
  inviterImage?: string | null;
  editingBySheet?: Record<string, DocEditActivity | null>;
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
      await reorderOrgSheets(organizationId, next.map((s) => s._id));
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
      id={`tdraw-org-sheets-${organizationId}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(ev) => void onDragEnd(ev)}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={gridClass}>
          {prepend}
          {sheets.map((s) => (
            <SortableOrgSheet
              key={s._id}
              sheet={s}
              view={view}
              currentUserId={currentUserId}
              orgRole={orgRole}
              inviterName={inviterName}
              inviterImage={inviterImage}
              editing={editingBySheet?.[s._id] ?? null}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
