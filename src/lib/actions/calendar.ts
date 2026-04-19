"use server";

import { auth } from "@/auth";
import dbConnect from "@/lib/db/mongoose";
import mongoose from "mongoose";
import CalendarEvent from "@/lib/models/CalendarEvent";
import { requireOrgMember } from "@/lib/authz/org";
import { revalidatePath } from "next/cache";

function mapRow(e: {
  _id: unknown;
  title?: string;
  description?: string;
  start?: Date;
  end?: Date;
  participantUserIds?: unknown[];
  guestEmails?: string[];
  location?: string;
  reminderMinutesBefore?: number | null;
  createdByUserId?: unknown;
}) {
  return {
    _id: String(e._id),
    title: e.title ?? "",
    description: e.description ?? "",
    start: new Date(e.start ?? 0).toISOString(),
    end: new Date(e.end ?? 0).toISOString(),
    participantUserIds: (e.participantUserIds || []).map(String),
    guestEmails: (e.guestEmails || []).filter(Boolean),
    location: e.location ?? "",
    reminderMinutesBefore: typeof e.reminderMinutesBefore === "number" ? e.reminderMinutesBefore : null,
    createdByUserId: String(e.createdByUserId),
  };
}

export async function listEvents(scope: "personal" | "org", organizationId?: string, from?: string, to?: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const range: Record<string, Date> = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);

  if (scope === "personal") {
    const q: Record<string, unknown> = {
      scope: "personal",
      createdByUserId: new mongoose.Types.ObjectId(session.user.id),
    };
    if (from || to) q.start = Object.keys(range).length ? range : undefined;
    return CalendarEvent.find(q)
      .sort({ start: 1 })
      .lean()
      .then((rows) => rows.map(mapRow));
  }

  if (!organizationId) throw new Error("Missing organizationId");
  await requireOrgMember(session.user.id, organizationId);

  const q: Record<string, unknown> = {
    scope: "org",
    organizationId: new mongoose.Types.ObjectId(organizationId),
  };
  if (from || to) q.start = Object.keys(range).length ? range : undefined;

  return CalendarEvent.find(q)
    .sort({ start: 1 })
    .lean()
    .then((rows) => rows.map(mapRow));
}

export async function createEvent(input: {
  scope: "personal" | "org";
  organizationId?: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  participantUserIds?: string[];
  guestEmails?: string[];
  location?: string;
  reminderMinutesBefore?: number | null;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  if (input.scope === "org") {
    if (!input.organizationId) throw new Error("Missing org");
    await requireOrgMember(session.user.id, input.organizationId);
  }

  const participantUserIds = (input.participantUserIds || []).map((id) => new mongoose.Types.ObjectId(id));
  const guestEmails = (input.guestEmails || [])
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 50);

  await CalendarEvent.create({
    scope: input.scope,
    organizationId: input.organizationId ? new mongoose.Types.ObjectId(input.organizationId) : undefined,
    title: input.title.trim().slice(0, 200),
    description: input.description?.slice(0, 4000),
    start: new Date(input.start),
    end: new Date(input.end),
    participantUserIds,
    guestEmails,
    location: input.location?.trim().slice(0, 500),
    reminderMinutesBefore:
      typeof input.reminderMinutesBefore === "number" && input.reminderMinutesBefore >= 0
        ? input.reminderMinutesBefore
        : undefined,
    createdByUserId: new mongoose.Types.ObjectId(session.user.id),
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/calendar");
}

export async function deleteEvent(eventId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const ev = await CalendarEvent.findById(eventId).lean();
  if (!ev) throw new Error("Not found");

  if (ev.scope === "personal") {
    if (String(ev.createdByUserId) !== session.user.id) throw new Error("Forbidden");
  } else {
    if (!ev.organizationId) throw new Error("Invalid");
    await requireOrgMember(session.user.id, String(ev.organizationId));
    if (String(ev.createdByUserId) !== session.user.id) throw new Error("Only creator can delete");
  }

  await CalendarEvent.deleteOne({ _id: eventId });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/calendar");
}

export async function updateEvent(
  eventId: string,
  input: {
    title?: string;
    description?: string;
    start?: string;
    end?: string;
    participantUserIds?: string[];
    guestEmails?: string[];
    location?: string;
    reminderMinutesBefore?: number | null;
  }
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const ev = await CalendarEvent.findById(eventId).lean();
  if (!ev) throw new Error("Not found");

  if (ev.scope === "personal") {
    if (String(ev.createdByUserId) !== session.user.id) throw new Error("Forbidden");
  } else {
    if (!ev.organizationId) throw new Error("Invalid");
    await requireOrgMember(session.user.id, String(ev.organizationId));
    if (String(ev.createdByUserId) !== session.user.id) throw new Error("Only creator can edit");
  }

  const participantUserIds = input.participantUserIds?.map((id) => new mongoose.Types.ObjectId(id));
  const guestEmails = input.guestEmails?.map((e) => e.trim().toLowerCase()).filter(Boolean).slice(0, 50);

  await CalendarEvent.updateOne(
    { _id: eventId },
    {
      $set: {
        ...(input.title !== undefined && { title: input.title.trim().slice(0, 200) }),
        ...(input.description !== undefined && { description: input.description?.slice(0, 4000) }),
        ...(input.start !== undefined && { start: new Date(input.start) }),
        ...(input.end !== undefined && { end: new Date(input.end) }),
        ...(participantUserIds !== undefined && { participantUserIds }),
        ...(guestEmails !== undefined && { guestEmails }),
        ...(input.location !== undefined && { location: input.location.trim().slice(0, 500) }),
        ...(input.reminderMinutesBefore !== undefined && {
          reminderMinutesBefore:
            input.reminderMinutesBefore === null || input.reminderMinutesBefore < 0
              ? undefined
              : input.reminderMinutesBefore,
        }),
      },
    }
  );
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/calendar");
}
