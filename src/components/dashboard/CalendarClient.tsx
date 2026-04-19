"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import type { DateSelectArg, EventClickArg, EventInput } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { createEvent, deleteEvent, updateEvent } from "@/lib/actions/calendar";
import { toastActionError } from "@/lib/client/actionFeedback";

type Ev = {
  _id: string;
  title: string;
  start: string;
  end: string;
  description: string;
  participantUserIds: string[];
  guestEmails: string[];
  location: string;
  reminderMinutesBefore: number | null;
  createdByUserId: string;
};

type Member = { userId: string; name: string; email: string };

const REMINDERS = [
  { m: 0, label: "None" },
  { m: 5, label: "5 min" },
  { m: 15, label: "15 min" },
  { m: 60, label: "1 h" },
  { m: 1440, label: "1 day" },
];

export default function CalendarClient({
  personal,
  orgBlocks,
  orgs,
  orgMembersByOrg,
  currentUserId,
}: {
  personal: Ev[];
  orgBlocks: { orgId: string; orgName: string; events: Ev[] }[];
  orgs: { _id: string; name: string }[];
  orgMembersByOrg: Record<string, Member[]>;
  currentUserId: string;
}) {
  const router = useRouter();
  const [calPersonal, setCalPersonal] = useState(true);
  const [calOrgIds, setCalOrgIds] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(orgs.map((o) => [o._id, true]))
  );
  const [miniMonth, setMiniMonth] = useState(() => new Date());
  const [fcView, setFcView] = useState<"dayGridMonth" | "timeGridWeek" | "timeGridDay">("dayGridMonth");

  const [compose, setCompose] = useState<{
    scope: "personal" | "org";
    orgId?: string;
    start: string;
    end: string;
  } | null>(null);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [guestEmails, setGuestEmails] = useState("");
  const [reminder, setReminder] = useState<number>(0);
  const [participantIds, setParticipantIds] = useState<string[]>([]);

  const [selected, setSelected] = useState<Ev | null>(null);

  const calendarEvents: EventInput[] = useMemo(() => {
    const out: EventInput[] = [];
    if (calPersonal) {
      for (const e of personal) {
        out.push({
          id: `p-${e._id}`,
          title: e.title,
          start: e.start,
          end: e.end,
          extendedProps: { raw: e, cal: "personal" as const },
          backgroundColor: "color-mix(in srgb, var(--color-accent) 42%, #111)",
          borderColor: "transparent",
        });
      }
    }
    for (const b of orgBlocks) {
      if (!calOrgIds[b.orgId]) continue;
      for (const e of b.events) {
        out.push({
          id: `o-${e._id}`,
          title: `${e.title}`,
          start: e.start,
          end: e.end,
          extendedProps: { raw: e, cal: "org" as const, orgName: b.orgName },
          backgroundColor: "color-mix(in srgb, var(--color-accent) 22%, #333)",
          borderColor: "transparent",
        });
      }
    }
    return out;
  }, [personal, orgBlocks, calPersonal, calOrgIds]);

  const onSelect = (arg: DateSelectArg) => {
    setCompose({ scope: "personal", start: arg.startStr, end: arg.endStr });
    setTitle("");
    setLocation("");
    setDescription("");
    setGuestEmails("");
    setReminder(0);
    setParticipantIds([]);
  };

  const onEventClick = (arg: EventClickArg) => {
    const raw = arg.event.extendedProps.raw as Ev;
    setSelected(raw);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compose || !title.trim()) return;
    try {
      await createEvent({
        scope: compose.scope,
        organizationId: compose.scope === "org" ? compose.orgId : undefined,
        title,
        description: description || undefined,
        start: compose.start,
        end: compose.end,
        location: location || undefined,
        reminderMinutesBefore: reminder > 0 ? reminder : null,
        participantUserIds: compose.scope === "org" && participantIds.length ? participantIds : undefined,
        guestEmails: guestEmails
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setCompose(null);
      router.refresh();
    } catch (err) {
      toastActionError(err, { id: "cal-create-event" });
    }
  };

  const members = compose?.orgId ? orgMembersByOrg[compose.orgId] ?? [] : [];

  const miniLabel = miniMonth.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-start">
      <aside className="glass-panel w-full shrink-0 rounded-[1.5rem] p-4 lg:w-72">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            className="rounded-xl p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Previous month"
            onClick={() =>
              setMiniMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
            }
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold">{miniLabel}</span>
          <button
            type="button"
            className="rounded-xl p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Next month"
            onClick={() =>
              setMiniMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
            }
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">Calendars</p>
        <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 hover:bg-black/5 dark:hover:bg-white/10">
          <input type="checkbox" checked={calPersonal} onChange={(e) => setCalPersonal(e.target.checked)} className="rounded" />
          <Calendar className="h-4 w-4 text-[var(--color-accent)]" />
          <span className="text-sm font-semibold">Personal</span>
        </label>
        {orgs.map((o) => (
          <label
            key={o._id}
            className="mb-1 flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <input
              type="checkbox"
              checked={!!calOrgIds[o._id]}
              onChange={(e) => setCalOrgIds((prev) => ({ ...prev, [o._id]: e.target.checked }))}
              className="rounded"
            />
            <span className="text-sm font-semibold">{o.name}</span>
          </label>
        ))}
        <p className="mt-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Drag across the main calendar to create an event. Org events support member participants; add guest emails for
          personal invites.
        </p>
      </aside>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["dayGridMonth", "Month"],
              ["timeGridWeek", "Week"],
              ["timeGridDay", "Day"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFcView(v)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                fcView === v ? "bg-[var(--color-accent)] text-white" : "glass-panel"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="glass-panel overflow-hidden rounded-[1.5rem] p-2 md:p-4">
          <FullCalendar
            key={fcView}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={fcView}
            headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
            height="auto"
            selectable
            selectMirror
            dayMaxEvents
            events={calendarEvents}
            select={(s) => onSelect(s)}
            eventClick={(c) => onEventClick(c)}
          />
        </div>
      </div>

      {compose ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCompose(null)} />
          <form
            onSubmit={(e) => void submitCreate(e)}
            className="glass-menu relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.75rem] p-6 shadow-2xl"
          >
            <h2 className="mb-3 text-lg font-bold">New event</h2>
            <div className="mb-3 flex gap-1 rounded-[1rem] bg-black/[0.05] p-1 dark:bg-white/[0.06]">
              <button
                type="button"
                className={`flex-1 rounded-[0.85rem] py-2 text-sm font-semibold ${compose.scope === "personal" ? "glass-panel" : ""}`}
                onClick={() => setCompose((c) => (c ? { ...c, scope: "personal", orgId: undefined } : c))}
              >
                Personal
              </button>
              <button
                type="button"
                disabled={!orgs.length}
                className={`flex-1 rounded-[0.85rem] py-2 text-sm font-semibold disabled:opacity-40 ${compose.scope === "org" ? "glass-panel" : ""}`}
                onClick={() =>
                  setCompose((c) =>
                    c ? { ...c, scope: "org", orgId: c.orgId ?? orgs[0]?._id } : c
                  )
                }
              >
                Organization
              </button>
            </div>
            {compose.scope === "org" ? (
              <select
                value={compose.orgId ?? orgs[0]?._id ?? ""}
                onChange={(e) => setCompose((c) => (c ? { ...c, orgId: e.target.value } : c))}
                className="mb-3 w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
              >
                {orgs.map((o) => (
                  <option key={o._id} value={o._id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : null}
            <p className="mb-3 text-xs text-gray-500">
              {new Date(compose.start).toLocaleString()} — {new Date(compose.end).toLocaleString()}
            </p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              required
              className="mb-2 w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm"
            />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location (optional)"
              className="mb-2 w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              rows={3}
              className="mb-2 w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm"
            />
            <label className="mb-2 block text-xs font-bold uppercase text-gray-500">Reminder</label>
            <select
              value={reminder}
              onChange={(e) => setReminder(Number(e.target.value))}
              className="mb-3 w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
            >
              {REMINDERS.map((r) => (
                <option key={r.m} value={r.m}>
                  {r.label}
                </option>
              ))}
            </select>
            <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Guest emails (comma / newline)</label>
            <textarea
              value={guestEmails}
              onChange={(e) => setGuestEmails(e.target.value)}
              rows={2}
              className="mb-3 w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
            />
            {compose.scope === "org" && compose.orgId ? (
              <div className="mb-3 max-h-36 space-y-1 overflow-y-auto rounded-xl border border-[var(--input-border)] p-2">
                {members.map((m) => (
                  <label key={m.userId} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={participantIds.includes(m.userId)}
                      onChange={(ev) => {
                        if (ev.target.checked) setParticipantIds((p) => [...p, m.userId]);
                        else setParticipantIds((p) => p.filter((id) => id !== m.userId));
                      }}
                    />
                    {m.name || m.email}
                  </label>
                ))}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setCompose(null)}>
                Cancel
              </button>
              <button type="submit" className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white">
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="glass-menu relative w-full max-w-md rounded-[1.75rem] p-6 shadow-2xl">
            <h2 className="text-lg font-bold">{selected.title}</h2>
            {selected.location ? <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{selected.location}</p> : null}
            <p className="mt-2 text-sm text-gray-500">
              {new Date(selected.start).toLocaleString()} — {new Date(selected.end).toLocaleString()}
            </p>
            {selected.description ? <p className="mt-3 text-sm">{selected.description}</p> : null}
            {selected.guestEmails?.length ? (
              <p className="mt-2 text-xs text-gray-500">Guests: {selected.guestEmails.join(", ")}</p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              {selected.createdByUserId === currentUserId ? (
                <>
                  <button
                    type="button"
                    className="rounded-xl bg-red-600/90 px-4 py-2 text-sm font-semibold text-white"
                    onClick={() => {
                      if (confirm("Delete this event?")) {
                        void deleteEvent(selected._id)
                          .then(() => {
                            setSelected(null);
                            router.refresh();
                          })
                          .catch((err) => toastActionError(err, { id: "cal-delete-event" }));
                      }
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white"
                    onClick={() => {
                      const nt = prompt("New title", selected.title);
                      if (nt === null) return;
                      void updateEvent(selected._id, { title: nt })
                        .then(() => {
                          setSelected(null);
                          router.refresh();
                        })
                        .catch((err) => toastActionError(err, { id: "cal-rename-event" }));
                    }}
                  >
                    Rename
                  </button>
                </>
              ) : (
                <p className="text-sm text-gray-500">Only the organizer can edit this event.</p>
              )}
              <button type="button" className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
