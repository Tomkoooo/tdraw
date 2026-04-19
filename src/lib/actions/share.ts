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

export async function createSheetInvite(
  sheetId: string,
  email: string,
  role: SheetShareRole,
  allowForwardShare: boolean,
  /** Hours until invite expires (1–168). Omit to use env default. */
  ttlHours?: number
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  await requireSheetPermission(session.user.id, sheetId, "share");

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

  await sendInviteEmail({
    to: normalized,
    subject: `You're invited to "${sheet?.title ?? "a note"}" on tDraw`,
    html: `<p>You have been invited with role: <strong>${role}</strong>.</p><p><a href="${link}">Open invitation</a></p><p>This link expires at ${expiresAt.toISOString()}.</p>`,
  });

  revalidatePath("/dashboard");
  revalidatePath(`/sheet/${sheetId}`);
  return { ok: true as const };
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

  revalidatePath("/dashboard");
  return { sheetId: String(inv.sheetId) };
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

/** Verify raw token for invite page (does not accept). */
export async function peekSheetInviteToken(rawToken: string) {
  await dbConnect();
  const inv = await SheetInvitation.findOne({ tokenHash: sha256Hex(rawToken) }).lean();
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) return null;
  return { email: inv.email, role: inv.role as SheetShareRole };
}
