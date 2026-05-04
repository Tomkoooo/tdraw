"use server";

import { auth } from "@/auth";
import dbConnect from "@/lib/db/mongoose";
import mongoose from "mongoose";
import SheetInvitation from "@/lib/models/SheetInvitation";
import SheetGrant from "@/lib/models/SheetGrant";
import { requireSheetPermission } from "@/lib/authz/sheet";
import { generateInviteToken, sha256Hex } from "@/lib/inviteTokens";
import { sendInviteEmail } from "@/lib/email/sendInviteEmail";
import { revalidatePath } from "next/cache";
import Sheet from "@/lib/models/Sheet";
import SheetPublicLink from "@/lib/models/SheetPublicLink";
import type { SheetShareRole } from "@/lib/models/SheetInvitation";

function defaultInviteTtlHours() {
  const h = Number(process.env.INVITE_TTL_HOURS ?? 48);
  if (!Number.isFinite(h) || h <= 0) return 48;
  return Math.min(168, Math.max(1, Math.round(h)));
}

function clampInviteTtlHours(requested?: number) {
  if (requested == null || !Number.isFinite(requested)) return defaultInviteTtlHours();
  return Math.min(168, Math.max(1, Math.round(requested)));
}

function clampPublicShareTtlHours(requested?: number) {
  if (requested == null || !Number.isFinite(requested)) return defaultInviteTtlHours();
  return Math.min(720, Math.max(1, Math.round(requested)));
}

export type CreateSheetInviteResult = {
  ok: true;
  emailStatus: "sent" | "skipped" | "failed";
};

export type SheetInviteListStatus = "pending" | "accepted" | "expired";

export type SheetInviteListItem = {
  email: string;
  role: SheetShareRole;
  allowForwardShare: boolean;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  status: SheetInviteListStatus;
};

function sheetInviteStatus(
  acceptedAt: Date | undefined | null,
  expiresAt: Date,
  now: Date
): SheetInviteListStatus {
  if (acceptedAt) return "accepted";
  if (expiresAt.getTime() <= now.getTime()) return "expired";
  return "pending";
}

export async function createSheetInvite(
  sheetId: string,
  email: string,
  role: SheetShareRole,
  allowForwardShare: boolean,
  /** Hours until invite expires (1–168). Omit to use env default. */
  ttlHours?: number
): Promise<CreateSheetInviteResult> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  try {
    await requireSheetPermission(session.user.id, sheetId, "share");
  } catch (e) {
    if (e instanceof Error && e.message === "Forbidden") {
      throw new Error("You don’t have permission to invite others to this note.");
    }
    throw e;
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) throw new Error("Invalid email");

  const { raw, hash } = generateInviteToken();
  const hours = clampInviteTtlHours(ttlHours);
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000);

  await SheetInvitation.findOneAndUpdate(
    { sheetId: new mongoose.Types.ObjectId(sheetId), email: normalized },
    {
      $set: {
        sheetId: new mongoose.Types.ObjectId(sheetId),
        email: normalized,
        role,
        allowForwardShare,
        tokenHash: hash,
        expiresAt,
        createdByUserId: new mongoose.Types.ObjectId(session.user.id),
      },
      $unset: { acceptedAt: "", acceptedByUserId: "" },
    },
    { upsert: true }
  );

  const sheet = await Sheet.findById(sheetId).select("title").lean();
  const base = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || "http://localhost:3000";
  const origin = base.startsWith("http") ? base : `https://${base}`;
  const link = `${origin}/invite/sheet/${raw}`;

  const mail = await sendInviteEmail({
    to: normalized,
    subject: `You're invited to "${sheet?.title ?? "a note"}" on tDraw`,
    html: `<p>You have been invited with role: <strong>${role}</strong>.</p><p><a href="${link}">Open invitation</a></p><p>This link expires at ${expiresAt.toISOString()}.</p>`,
  });

  const emailStatus: CreateSheetInviteResult["emailStatus"] = mail.skipped
    ? "skipped"
    : mail.ok
      ? "sent"
      : "failed";

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/invites");
  revalidatePath(`/sheet/${sheetId}`);
  return { ok: true as const, emailStatus };
}

export async function acceptSheetInviteByToken(rawToken: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (!session.user.email) throw new Error("No email on session");

  await dbConnect();
  const hash = sha256Hex(rawToken);
  const inv = await SheetInvitation.findOne({ tokenHash: hash }).lean();
  if (!inv) throw new Error("Invalid or expired invite");
  if (inv.acceptedAt) throw new Error("Already accepted");
  if (inv.expiresAt < new Date()) throw new Error("Expired");

  const email = session.user.email.trim().toLowerCase();
  if (email !== inv.email) throw new Error("Signed in with a different email than the invitation");

  await SheetGrant.updateOne(
    { sheetId: inv.sheetId, granteeUserId: new mongoose.Types.ObjectId(session.user.id) },
    {
      $set: {
        sheetId: inv.sheetId,
        granteeUserId: new mongoose.Types.ObjectId(session.user.id),
        role: inv.role,
        via: "share",
        allowForwardShare: inv.allowForwardShare,
      },
    },
    { upsert: true }
  );

  await SheetInvitation.updateOne(
    { _id: inv._id },
    { $set: { acceptedAt: new Date(), acceptedByUserId: new mongoose.Types.ObjectId(session.user.id) } }
  );

  const sid = String(inv.sheetId);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/invites");
  revalidatePath("/", "layout");
  revalidatePath(`/sheet/${sid}`);
  return { sheetId: sid };
}

/**
 * Accept a pending sheet invite for the signed-in user's email (same outcome as opening the email link).
 * Requires a verified session email matching the invitation.
 */
export async function acceptPendingSheetInviteForSession(sheetId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (!session.user.email) throw new Error("No email on session");

  await dbConnect();
  const email = session.user.email.trim().toLowerCase();
  const now = new Date();
  const inv = await SheetInvitation.findOne({
    sheetId: new mongoose.Types.ObjectId(sheetId),
    email,
    acceptedAt: { $exists: false },
    expiresAt: { $gt: now },
  }).lean();
  if (!inv) throw new Error("No pending invitation for this note");

  await SheetGrant.updateOne(
    { sheetId: inv.sheetId, granteeUserId: new mongoose.Types.ObjectId(session.user.id) },
    {
      $set: {
        sheetId: inv.sheetId,
        granteeUserId: new mongoose.Types.ObjectId(session.user.id),
        role: inv.role,
        via: "share",
        allowForwardShare: inv.allowForwardShare,
      },
    },
    { upsert: true }
  );

  await SheetInvitation.updateOne(
    { _id: inv._id },
    { $set: { acceptedAt: new Date(), acceptedByUserId: new mongoose.Types.ObjectId(session.user.id) } }
  );

  const sid = String(inv.sheetId);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/invites");
  revalidatePath("/", "layout");
  revalidatePath(`/sheet/${sid}`);
  return { sheetId: sid };
}

export async function listPendingSheetInvites(sheetId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  await requireSheetPermission(session.user.id, sheetId, "share");

  const list = await SheetInvitation.find({
    sheetId: new mongoose.Types.ObjectId(sheetId),
    acceptedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  })
    .select("email role allowForwardShare expiresAt")
    .lean();

  return list.map((i) => ({
    email: i.email,
    role: i.role,
    allowForwardShare: i.allowForwardShare,
    expiresAt: i.expiresAt.toISOString(),
  }));
}

const SHEET_INVITE_LIST_LIMIT = 120;

/** Invitations for this sheet (newest first). Expired rows omitted unless `includeExpired`. */
export async function listSheetInvites(
  sheetId: string,
  opts?: { includeExpired?: boolean }
): Promise<{ items: SheetInviteListItem[]; hiddenExpiredCount: number }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  try {
    await requireSheetPermission(session.user.id, sheetId, "share");
  } catch (e) {
    if (e instanceof Error && e.message === "Forbidden") {
      throw new Error("You don’t have permission to view invitations for this note.");
    }
    throw e;
  }

  const includeExpired = Boolean(opts?.includeExpired);
  const raw = await SheetInvitation.find({ sheetId: new mongoose.Types.ObjectId(sheetId) })
    .select("email role allowForwardShare expiresAt acceptedAt createdAt")
    .sort({ createdAt: -1 })
    .limit(SHEET_INVITE_LIST_LIMIT)
    .lean();

  const now = new Date();
  const mapped: SheetInviteListItem[] = raw.map((i) => {
    const acceptedAt = i.acceptedAt ?? null;
    const status = sheetInviteStatus(acceptedAt, i.expiresAt, now);
    return {
      email: i.email,
      role: i.role as SheetShareRole,
      allowForwardShare: Boolean(i.allowForwardShare),
      expiresAt: i.expiresAt.toISOString(),
      acceptedAt: acceptedAt ? acceptedAt.toISOString() : null,
      createdAt: (i.createdAt ?? i.expiresAt).toISOString(),
      status,
    };
  });

  const hiddenExpiredCount = mapped.filter((m) => m.status === "expired").length;
  const items = includeExpired ? mapped : mapped.filter((m) => m.status !== "expired");

  return { items, hiddenExpiredCount: includeExpired ? 0 : hiddenExpiredCount };
}

export type SheetPublicLinkListItem = {
  id: string;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  active: boolean;
};

/** Read-only note payload for anonymous `/share/sheet/[token]` (no session). */
export async function getSheetForPublicShareToken(rawToken: string) {
  await dbConnect();
  const now = new Date();
  const link = await SheetPublicLink.findOne({
    tokenHash: sha256Hex(rawToken),
    revokedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  }).lean();
  if (!link) return null;

  const sheet = await Sheet.findById(link.sheetId).lean();
  if (!sheet || sheet.deletedAt) return null;

  return {
    _id: sheet._id.toString(),
    title: sheet.title,
    canvasState: sheet.canvasState,
    updatedAt: sheet.updatedAt ? new Date(sheet.updatedAt).toISOString() : new Date().toISOString(),
    createdAt: sheet.createdAt ? new Date(sheet.createdAt).toISOString() : new Date().toISOString(),
    contentVersion: sheet.contentVersion ?? 0,
    organizationId: sheet.organizationId ? String(sheet.organizationId) : null,
    folderId: sheet.folderId ? String(sheet.folderId) : null,
    approxBytes: typeof sheet.approxBytes === "number" ? sheet.approxBytes : 0,
    inTrash: false,
    canWrite: false,
    canTitle: false,
  };
}

export async function createSheetPublicLink(
  sheetId: string,
  opts: { neverExpires?: boolean; ttlHours?: number },
): Promise<{ url: string; rawToken: string; expiresAt: string | null }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  try {
    await requireSheetPermission(session.user.id, sheetId, "share");
  } catch (e) {
    if (e instanceof Error && e.message === "Forbidden") {
      throw new Error("You don’t have permission to create a public link for this note.");
    }
    throw e;
  }

  const { raw, hash } = generateInviteToken();
  const neverExpires = Boolean(opts.neverExpires);
  const expiresAt = neverExpires
    ? null
    : new Date(Date.now() + clampPublicShareTtlHours(opts.ttlHours) * 3600 * 1000);

  await SheetPublicLink.create({
    sheetId: new mongoose.Types.ObjectId(sheetId),
    tokenHash: hash,
    expiresAt,
    revokedAt: null,
    createdByUserId: new mongoose.Types.ObjectId(session.user.id),
  });

  const base = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || "http://localhost:3000";
  const origin = base.startsWith("http") ? base : `https://${base}`;
  const url = `${origin}/share/sheet/${raw}`;

  revalidatePath(`/sheet/${sheetId}`);
  return {
    url,
    rawToken: raw,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  };
}

export async function listSheetPublicLinks(sheetId: string): Promise<SheetPublicLinkListItem[]> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  await requireSheetPermission(session.user.id, sheetId, "share");

  const rows = await SheetPublicLink.find({ sheetId: new mongoose.Types.ObjectId(sheetId) })
    .select("_id expiresAt revokedAt createdAt")
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();

  const now = new Date();
  return rows.map((r) => {
    const revokedAt = r.revokedAt ?? null;
    const expiredByTtl = r.expiresAt != null && r.expiresAt <= now;
    const active = !revokedAt && !expiredByTtl;
    return {
      id: String(r._id),
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      createdAt: (r.createdAt ?? r.expiresAt ?? now).toISOString(),
      revokedAt: revokedAt ? revokedAt.toISOString() : null,
      active,
    };
  });
}

export async function revokeSheetPublicLink(sheetId: string, linkId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  await requireSheetPermission(session.user.id, sheetId, "share");

  const res = await SheetPublicLink.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(linkId),
      sheetId: new mongoose.Types.ObjectId(sheetId),
      revokedAt: null,
    },
    { $set: { revokedAt: new Date() } },
    { new: true },
  );
  if (!res) throw new Error("Link not found or already revoked");

  revalidatePath(`/sheet/${sheetId}`);
}

/** Verify raw token for invite page (does not accept). */
export async function peekSheetInviteToken(rawToken: string) {
  await dbConnect();
  const inv = await SheetInvitation.findOne({ tokenHash: sha256Hex(rawToken) }).lean();
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) return null;
  return { email: inv.email, role: inv.role as SheetShareRole };
}
