"use server";

import { auth } from "@/auth";
import dbConnect from "@/lib/db/mongoose";
import mongoose from "mongoose";
import Organization from "@/lib/models/Organization";
import OrganizationMember from "@/lib/models/OrganizationMember";
import OrganizationInvitation from "@/lib/models/OrganizationInvitation";
import { requireOrgAdmin, requireOrgMember } from "@/lib/authz/org";
import { generateInviteToken, sha256Hex } from "@/lib/inviteTokens";
import { sendInviteEmail } from "@/lib/email/sendInviteEmail";
import { revalidatePath } from "next/cache";
import type { OrgMemberRole } from "@/lib/models/Organization";

function inviteTtlMs() {
  const h = Number(process.env.INVITE_TTL_HOURS ?? 48);
  if (!Number.isFinite(h) || h <= 0) return 48 * 3600 * 1000;
  return h * 3600 * 1000;
}

export async function createOrganization(name: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const existing = await Organization.findOne({ createdByUserId: session.user.id }).lean();
  if (existing) throw new Error("You can only create one organization");

  const org = await Organization.create({
    name: name.trim().slice(0, 120) || "My Organization",
    createdByUserId: new mongoose.Types.ObjectId(session.user.id),
  });

  await OrganizationMember.create({
    organizationId: org._id,
    userId: new mongoose.Types.ObjectId(session.user.id),
    role: "admin",
  });

  revalidatePath("/dashboard");
  return org._id.toString();
}

export async function listMyOrganizations() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const memberships = await OrganizationMember.find({ userId: session.user.id }).lean();
  const ids = memberships.map((m) => m.organizationId);
  if (ids.length === 0) return [];

  const orgs = await Organization.find({ _id: { $in: ids } }).lean();
  const roleByOrg = new Map(memberships.map((m) => [String(m.organizationId), m.role]));

  return orgs.map((o) => ({
    _id: o._id.toString(),
    name: o.name,
    role: roleByOrg.get(String(o._id)) as OrgMemberRole,
    createdByUserId: String(o.createdByUserId),
  }));
}

export async function listOrganizationMembers(organizationId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  await requireOrgAdmin(session.user.id, organizationId);

  const members = await OrganizationMember.find({
    organizationId: new mongoose.Types.ObjectId(organizationId),
  })
    .populate("userId", "email name image")
    .lean();
  type Pop = { _id: mongoose.Types.ObjectId; email: string; name: string; image?: string };
  type Row = { userId: Pop; role: string };
  return (members as Row[]).map((m) => ({
    userId: String(m.userId._id),
    email: m.userId.email,
    name: m.userId.name,
    image: m.userId.image,
    role: m.role as OrgMemberRole,
  }));
}

/** Any org member can read the roster (for task assignment, calendar invites). */
export async function listOrgMembersForAssignment(organizationId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  await requireOrgMember(session.user.id, organizationId);

  const members = await OrganizationMember.find({
    organizationId: new mongoose.Types.ObjectId(organizationId),
  })
    .populate("userId", "email name image")
    .lean();
  type Pop = { _id: mongoose.Types.ObjectId; email: string; name: string; image?: string };
  type Row = { userId: Pop; role: string };
  return (members as Row[]).map((m) => ({
    userId: String(m.userId._id),
    email: m.userId.email,
    name: m.userId.name,
    image: m.userId.image,
    role: m.role as OrgMemberRole,
  }));
}

export async function inviteOrganizationMember(organizationId: string, email: string, role: OrgMemberRole) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  await requireOrgAdmin(session.user.id, organizationId);

  const normalized = email.trim().toLowerCase();
  const { raw, hash } = generateInviteToken();
  const expiresAt = new Date(Date.now() + inviteTtlMs());

  await OrganizationInvitation.findOneAndUpdate(
    { organizationId: new mongoose.Types.ObjectId(organizationId), email: normalized },
    {
      $set: {
        organizationId: new mongoose.Types.ObjectId(organizationId),
        email: normalized,
        role,
        tokenHash: hash,
        expiresAt,
        invitedByUserId: new mongoose.Types.ObjectId(session.user.id),
      },
      $unset: { acceptedAt: "", acceptedByUserId: "" },
    },
    { upsert: true }
  );

  const org = await Organization.findById(organizationId).select("name").lean();
  const base = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || "http://localhost:3000";
  const origin = base.startsWith("http") ? base : `https://${base}`;
  const link = `${origin}/invite/org/${raw}`;

  await sendInviteEmail({
    to: normalized,
    subject: `Join ${org?.name ?? "organization"} on tDraw`,
    html: `<p>You were invited as <strong>${role}</strong>.</p><p><a href="${link}">Accept invitation</a></p>`,
  });

  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function acceptOrgInviteByToken(rawToken: string) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) throw new Error("Unauthorized");

  await dbConnect();
  const inv = await OrganizationInvitation.findOne({ tokenHash: sha256Hex(rawToken) }).lean();
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new Error("Invalid invite");

  const email = session.user.email.trim().toLowerCase();
  if (email !== inv.email) throw new Error("Wrong account");

  await OrganizationMember.updateOne(
    { organizationId: inv.organizationId, userId: new mongoose.Types.ObjectId(session.user.id) },
    {
      $set: {
        organizationId: inv.organizationId,
        userId: new mongoose.Types.ObjectId(session.user.id),
        role: inv.role,
      },
    },
    { upsert: true }
  );

  await OrganizationInvitation.updateOne(
    { _id: inv._id },
    { $set: { acceptedAt: new Date(), acceptedByUserId: new mongoose.Types.ObjectId(session.user.id) } }
  );

  revalidatePath("/dashboard");
  return { organizationId: String(inv.organizationId) };
}

export async function removeOrganizationMember(organizationId: string, userId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  await requireOrgAdmin(session.user.id, organizationId);

  const org = await Organization.findById(organizationId).lean();
  if (!org) throw new Error("Not found");
  if (String(org.createdByUserId) === userId) throw new Error("Cannot remove organization owner");

  await OrganizationMember.deleteOne({
    organizationId: new mongoose.Types.ObjectId(organizationId),
    userId: new mongoose.Types.ObjectId(userId),
  });
  revalidatePath("/dashboard");
}

export async function updateOrganizationMemberRole(organizationId: string, userId: string, role: OrgMemberRole) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  await requireOrgAdmin(session.user.id, organizationId);

  const org = await Organization.findById(organizationId).lean();
  if (!org) throw new Error("Not found");
  if (String(org.createdByUserId) === userId && role !== "admin") {
    throw new Error("Owner must remain admin");
  }

  await OrganizationMember.updateOne(
    { organizationId: new mongoose.Types.ObjectId(organizationId), userId: new mongoose.Types.ObjectId(userId) },
    { $set: { role } }
  );
  revalidatePath("/dashboard");
}

export async function getOrganizationMeta(organizationId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  const role = await requireOrgMember(session.user.id, organizationId);
  const org = await Organization.findById(organizationId).lean();
  if (!org) throw new Error("Not found");
  return { name: org.name, role };
}

export async function peekOrgInviteToken(rawToken: string) {
  await dbConnect();
  const inv = await OrganizationInvitation.findOne({ tokenHash: sha256Hex(rawToken) }).lean();
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) return null;
  return { email: inv.email, role: inv.role as OrgMemberRole };
}
