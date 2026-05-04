import mongoose from "mongoose";
import SheetPublicLink from "@/lib/models/SheetPublicLink";
import Sheet from "@/lib/models/Sheet";
import { sha256Hex } from "@/lib/inviteTokens";

/**
 * Validates a raw public-share token for Socket.io: link exists, not revoked,
 * not expired, and matches the claimed sheet id. Trashed sheets are rejected.
 */
export async function validatePublicShareTokenForSheet(rawToken: string, sheetId: string): Promise<boolean> {
  if (!rawToken || !sheetId) return false;
  const hash = sha256Hex(rawToken);
  const now = new Date();
  const link = await SheetPublicLink.findOne({
    tokenHash: hash,
    sheetId: new mongoose.Types.ObjectId(sheetId),
    revokedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  })
    .select("_id")
    .lean();
  if (!link) return false;

  const sheet = await Sheet.findById(sheetId).select("deletedAt").lean();
  if (!sheet) return false;
  if (sheet.deletedAt) return false;
  return true;
}
