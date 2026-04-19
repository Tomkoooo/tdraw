"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, X } from "lucide-react";

function labelFor(id: string) {
  return id.replace(/-/g, " ");
}

function SortableRow({ id, onRemove }: { id: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="glass-panel flex min-h-[52px] items-center gap-3 rounded-2xl px-3 py-2"
    >
      <button
        type="button"
        className="touch-none rounded-xl p-2 text-gray-400 hover:bg-black/5 dark:hover:bg-white/10"
        aria-label="Reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 capitalize text-sm font-semibold text-[var(--color-text)]">{labelFor(id)}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-xl p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
        aria-label={`Remove ${id}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function HotbarSettingsForm({
  allIds,
  initialSelected,
  saveAction,
}: {
  allIds: string[];
  initialSelected: string[];
  saveAction: (ids: string[]) => Promise<void>;
}) {
  const router = useRouter();
  const baseOrder = useMemo(
    () => (initialSelected.length ? initialSelected.filter((id) => allIds.includes(id)) : [...allIds]),
    [allIds, initialSelected]
  );
  const [ordered, setOrdered] = useState<string[]>(() => baseOrder);
  const [saving, setSaving] = useState(false);

  const inBar = new Set(ordered);
  const pool = allIds.filter((id) => !inBar.has(id));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.indexOf(String(active.id));
    const newIndex = ordered.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setOrdered(arrayMove(ordered, oldIndex, newIndex));
  };

  const remove = (id: string) => {
    setOrdered((o) => o.filter((x) => x !== id));
  };

  const add = (id: string) => {
    setOrdered((o) => [...o, id]);
  };

  return (
    <div className="mt-8 space-y-8">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Toolbar order</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Drag to reorder. These tools appear in your bottom tldraw bar. Empty selection restores defaults.
        </p>
        <DndContext id="tdraw-settings-hotbar" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ordered} strategy={verticalListSortingStrategy}>
            <div className="mt-4 flex flex-col gap-2">
              {ordered.map((id) => (
                <SortableRow key={id} id={id} onRemove={() => remove(id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {pool.length > 0 ? (
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Add tools</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {pool.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => add(id)}
                className="glass-panel inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold capitalize"
              >
                <Plus className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                {labelFor(id)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          className="glass-panel rounded-2xl px-5 py-2.5 text-sm font-semibold"
          onClick={() => setOrdered([...allIds])}
        >
          Reset all
        </button>
        <button
          type="button"
          className="glass-panel rounded-2xl px-5 py-2.5 text-sm font-semibold"
          onClick={() => setOrdered([])}
        >
          Clear (defaults)
        </button>
        <button
          type="button"
          disabled={saving}
          className="rounded-2xl bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          onClick={async () => {
            setSaving(true);
            try {
              await saveAction(ordered.length ? ordered : []);
              router.refresh();
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
