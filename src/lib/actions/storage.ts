"use server";

import { auth } from "@/auth";
import dbConnect from "@/lib/db/mongoose";
import mongoose from "mongoose";
import Sheet from "@/lib/models/Sheet";
import User from "@/lib/models/User";
import { requireOrgMember } from "@/lib/authz/org";

const DEFAULT_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

const LIVE_SHEET = { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] };

export async function getPersonalDriveStorage() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const u = await User.findById(session.user.id).select("storageQuotaBytes").lean();
  const quota = typeof u?.storageQuotaBytes === "number" && u.storageQuotaBytes > 0 ? u.storageQuotaBytes : DEFAULT_QUOTA_BYTES;

  const agg = await Sheet.aggregate<{ used: number }>([
    {
      $match: {
        $and: [
          { userId: new mongoose.Types.ObjectId(session.user.id) },
          { $or: [{ organizationId: null }, { organizationId: { $exists: false } }] },
          LIVE_SHEET,
        ],
      },
    },
    { $group: { _id: null, used: { $sum: { $ifNull: ["$approxBytes", 0] } } } },
  ]);

  const used = Math.round(agg[0]?.used ?? 0);
  return { used, quota };
}

export async function getOrganizationDriveStorage(organizationId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  await requireOrgMember(session.user.id, organizationId);

  const agg = await Sheet.aggregate<{ used: number }>([
    {
      $match: {
        organizationId: new mongoose.Types.ObjectId(organizationId),
        ...LIVE_SHEET,
      },
    },
    { $group: { _id: null, used: { $sum: { $ifNull: ["$approxBytes", 0] } } } },
  ]);

  const used = Math.round(agg[0]?.used ?? 0);
  return { used, quota: DEFAULT_QUOTA_BYTES };
}
