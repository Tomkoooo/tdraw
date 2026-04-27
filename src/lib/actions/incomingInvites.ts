"use server";

import { auth } from "@/auth";
import dbConnect from "@/lib/db/mongoose";
import mongoose from "mongoose";
import SheetInvitation from "@/lib/models/SheetInvitation";
import OrganizationInvitation from "@/lib/models/OrganizationInvitation";
import Sheet from "@/lib/models/Sheet";
import Organization from "@/lib/models/Organization";
import User from "@/lib/models/User";
import type { SheetShareRole } from "@/lib/models/SheetInvitation";
import type { OrgMemberRole } from "@/lib/models/Organization";

export type IncomingSheetInviteRow = {
  sheetId: string;
  title: string;
  role: SheetShareRole;
  allowForwardShare: boolean;
  expiresAt: string;
  inviterName: string | null;
};

export type IncomingOrgInviteRow = {
  organizationId: string;
  organizationName: string;
  role: OrgMemberRole;
  expiresAt: string;
  inviterName: string | null;
};

function pendingSheetFilter(email: string, now: Date) {
  return {
    email,
    acceptedAt: { $exists: false },
    expiresAt: { $gt: now },
  } as const;
}

function pendingOrgFilter(email: string, now: Date) {
  return {
    email,
    acceptedAt: { $exists: false },
    expiresAt: { $gt: now },
  } as const;
}

export async function countPendingIncomingInvitations(): Promise<number> {
  const session = await auth();
  if (!session?.user?.email) return 0;
  await dbConnect();
  const email = session.user.email.trim().toLowerCase();
  const now = new Date();
  const [s, o] = await Promise.all([
    SheetInvitation.countDocuments(pendingSheetFilter(email, now)),
    OrganizationInvitation.countDocuments(pendingOrgFilter(email, now)),
  ]);
  return s + o;
}

export async function listIncomingInvitationsForSession(): Promise<{
  sheets: IncomingSheetInviteRow[];
  orgs: IncomingOrgInviteRow[];
}> {
  const session = await auth();
  if (!session?.user?.email) return { sheets: [], orgs: [] };

  await dbConnect();
  const email = session.user.email.trim().toLowerCase();
  const now = new Date();

  const [sheetInvs, orgInvs] = await Promise.all([
    SheetInvitation.find(pendingSheetFilter(email, now))
      .select("sheetId role allowForwardShare expiresAt createdByUserId")
      .sort({ createdAt: -1 })
      .limit(80)
      .lean(),
    OrganizationInvitation.find(pendingOrgFilter(email, now))
      .select("organizationId role expiresAt invitedByUserId")
      .sort({ createdAt: -1 })
      .limit(80)
      .lean(),
  ]);

  const sheetIds = [...new Set(sheetInvs.map((i) => String(i.sheetId)))];
  const orgIds = [...new Set(orgInvs.map((i) => String(i.organizationId)))];
  const userIds = [
    ...new Set([
      ...sheetInvs.map((i) => String(i.createdByUserId)),
      ...orgInvs.map((i) => String(i.invitedByUserId)),
    ]),
  ];

  const [sheets, orgs, users] = await Promise.all([
    sheetIds.length
      ? Sheet.find({ _id: { $in: sheetIds.map((id) => new mongoose.Types.ObjectId(id)) } })
          .select("title")
          .lean()
      : [],
    orgIds.length
      ? Organization.find({ _id: { $in: orgIds.map((id) => new mongoose.Types.ObjectId(id)) } })
          .select("name")
          .lean()
      : [],
    userIds.length
      ? User.find({ _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) } })
          .select("name")
          .lean()
      : [],
  ]);

  const titleBySheet = new Map(sheets.map((s) => [String(s._id), typeof s.title === "string" ? s.title : "Note"]));
  const nameByOrg = new Map(orgs.map((o) => [String(o._id), typeof o.name === "string" ? o.name : "Organization"]));
  const nameByUser = new Map(users.map((u) => [String(u._id), typeof u.name === "string" ? u.name : null]));

  const sheetsOut: IncomingSheetInviteRow[] = sheetInvs.map((i) => ({
    sheetId: String(i.sheetId),
    title: titleBySheet.get(String(i.sheetId)) ?? "Note",
    role: i.role as SheetShareRole,
    allowForwardShare: Boolean(i.allowForwardShare),
    expiresAt: i.expiresAt.toISOString(),
    inviterName: nameByUser.get(String(i.createdByUserId)) ?? null,
  }));

  const orgsOut: IncomingOrgInviteRow[] = orgInvs.map((i) => ({
    organizationId: String(i.organizationId),
    organizationName: nameByOrg.get(String(i.organizationId)) ?? "Organization",
    role: i.role as OrgMemberRole,
    expiresAt: i.expiresAt.toISOString(),
    inviterName: nameByUser.get(String(i.invitedByUserId)) ?? null,
  }));

  return { sheets: sheetsOut, orgs: orgsOut };
}
