import mongoose from "mongoose";
import SheetInvitation from "@/lib/models/SheetInvitation";
import SheetGrant from "@/lib/models/SheetGrant";
import OrganizationInvitation from "@/lib/models/OrganizationInvitation";
import OrganizationMember from "@/lib/models/OrganizationMember";

/**
 * When a user registers or signs in, attach any pending email invitations.
 * Extend: add audit log, welcome emails, org policy checks.
 */
export async function reconcileInvitesForUser(userId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  const uid = new mongoose.Types.ObjectId(userId);

  const pendingSheets = await SheetInvitation.find({
    email: normalized,
    acceptedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  }).lean();

  for (const inv of pendingSheets) {
    await SheetGrant.updateOne(
      {
        sheetId: inv.sheetId,
        granteeUserId: uid,
      },
      {
        $set: {
          sheetId: inv.sheetId,
          granteeUserId: uid,
          role: inv.role,
          via: "share",
          allowForwardShare: inv.allowForwardShare,
        },
      },
      { upsert: true }
    );
    await SheetInvitation.updateOne(
      { _id: inv._id },
      { $set: { acceptedAt: new Date(), acceptedByUserId: uid } }
    );
  }

  const pendingOrgs = await OrganizationInvitation.find({
    email: normalized,
    acceptedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  }).lean();

  for (const inv of pendingOrgs) {
    await OrganizationMember.updateOne(
      { organizationId: inv.organizationId, userId: uid },
      {
        $set: {
          organizationId: inv.organizationId,
          userId: uid,
          role: inv.role,
        },
      },
      { upsert: true }
    );
    await OrganizationInvitation.updateOne(
      { _id: inv._id },
      { $set: { acceptedAt: new Date(), acceptedByUserId: uid } }
    );
  }
}
