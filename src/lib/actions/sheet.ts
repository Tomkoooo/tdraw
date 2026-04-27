"use server";

import { auth } from "@/auth";
import dbConnect from "@/lib/db/mongoose";
import mongoose from "mongoose";
import Sheet from "@/lib/models/Sheet";
import SheetGrant from "@/lib/models/SheetGrant";
import SheetInvitation from "@/lib/models/SheetInvitation";
import Folder from "@/lib/models/Folder";
import Organization from "@/lib/models/Organization";
import User from "@/lib/models/User";
import { revalidatePath } from "next/cache";
import { requireSheetPermission, getEffectiveSheetAccess } from "@/lib/authz/sheet";
import { requireOrgMember, requireOrgAdmin } from "@/lib/authz/org";
import { roleMeets } from "@/lib/authz/types";

/** Sheets not in trash (missing field counts as live for legacy docs). */
const LIVE_SHEET = { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] };

/** Folders not in trash (same shape as `folder` actions). */
const LIVE_FOLDER = { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] };

function approxStateBytes(canvasState: unknown): number {
  try {
    const s = typeof canvasState === "string" ? canvasState : JSON.stringify(canvasState ?? {});
    return Buffer.byteLength(s, "utf8");
  } catch {
    return 0;
  }
}

function collectReferencedFileIds(value: unknown): Set<string> {
  const refs = new Set<string>();
  const scanElements = (elements: unknown) => {
    if (!Array.isArray(elements)) return;
    for (const element of elements) {
      if (!element || typeof element !== "object") continue;
      const fileId = (element as { fileId?: unknown }).fileId;
      if (typeof fileId === "string" && fileId.length > 0) refs.add(fileId);
    }
  };

  if (!value || typeof value !== "object") return refs;
  const root = value as { elements?: unknown; pages?: unknown };
  scanElements(root.elements);
  if (Array.isArray(root.pages)) {
    for (const page of root.pages) {
      if (!page || typeof page !== "object") continue;
      scanElements((page as { elements?: unknown }).elements);
    }
  }
  return refs;
}

function mapDriveSheet(sheet: {
  _id: unknown;
  title?: string;
  updatedAt?: Date;
  createdAt?: Date;
  previewImage?: string;
  folderId?: unknown;
  organizationId?: unknown;
  userId?: unknown;
  pinned?: boolean;
  approxBytes?: number;
}) {
  return {
    _id: String(sheet._id),
    title: sheet.title ?? "Untitled Note",
    updatedAt: sheet.updatedAt ? new Date(sheet.updatedAt).toISOString() : new Date().toISOString(),
    createdAt: sheet.createdAt ? new Date(sheet.createdAt).toISOString() : new Date().toISOString(),
    previewImage: sheet.previewImage || null,
    folderId: sheet.folderId ? String(sheet.folderId) : null,
    organizationId: sheet.organizationId ? String(sheet.organizationId) : null,
    userId: sheet.userId ? String(sheet.userId) : undefined,
    pinned: !!sheet.pinned,
    approxBytes: typeof sheet.approxBytes === "number" ? sheet.approxBytes : 0,
  };
}

export async function createSheet(opts?: { folderId?: string; organizationId?: string; title?: string }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await dbConnect();

  let organizationId: mongoose.Types.ObjectId | undefined;
  if (opts?.organizationId) {
    await requireOrgMember(session.user.id, opts.organizationId);
    organizationId = new mongoose.Types.ObjectId(opts.organizationId);
  }

  if (opts?.folderId) {
    const folder = await Folder.findOne({ _id: opts.folderId, ...LIVE_FOLDER }).lean();
    if (!folder) throw new Error("Folder not found");
    if (organizationId) {
      if (!folder.organizationId || String(folder.organizationId) !== String(organizationId)) {
        throw new Error("Invalid folder");
      }
    } else {
      if (!folder.ownerUserId || String(folder.ownerUserId) !== session.user.id) {
        throw new Error("Invalid folder");
      }
    }
  }

  let maxSortQuery: Record<string, unknown>;
  if (organizationId) {
    const parts: Record<string, unknown>[] = [{ organizationId }, { ...LIVE_SHEET }];
    if (opts?.folderId) {
      parts.push({ folderId: new mongoose.Types.ObjectId(opts.folderId) });
    } else {
      parts.push({ $or: [{ folderId: null }, { folderId: { $exists: false } }] });
    }
    maxSortQuery = { $and: parts };
  } else {
    maxSortQuery = {
      $and: [
        { userId: new mongoose.Types.ObjectId(session.user.id) },
        { $or: [{ organizationId: null }, { organizationId: { $exists: false } }] },
        { ...LIVE_SHEET },
        opts?.folderId
          ? { folderId: new mongoose.Types.ObjectId(opts.folderId) }
          : { $or: [{ folderId: null }, { folderId: { $exists: false } }] },
      ],
    };
  }

  const last = await Sheet.findOne(maxSortQuery).sort({ sortIndex: -1 }).select("sortIndex").lean();
  const sortIndex = typeof last?.sortIndex === "number" ? last.sortIndex + 1 : 0;

  const normalizedTitle = typeof opts?.title === "string" ? opts.title.trim().slice(0, 120) : "";
  const newSheet = await Sheet.create({
    userId: session.user.id,
    title: normalizedTitle.length > 0 ? normalizedTitle : "Untitled Note",
    canvasState: {},
    folderId: opts?.folderId ? new mongoose.Types.ObjectId(opts.folderId) : undefined,
    organizationId,
    sortIndex,
  });

  revalidatePath("/dashboard");
  return newSheet._id.toString();
}

export async function getMySheets() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await dbConnect();
  const ownerId = new mongoose.Types.ObjectId(session.user.id);
  const sheets = await Sheet.find({
    userId: ownerId,
    $and: [{ $or: [{ organizationId: null }, { organizationId: { $exists: false } }] }, LIVE_SHEET],
  })
    .sort({ pinned: -1, sortIndex: 1, updatedAt: -1 })
    .lean();

  return sheets.map(mapDriveSheet);
}

const ROOT_SHEET_FOLDER = { $or: [{ folderId: null }, { folderId: { $exists: false } }] };

/** Personal drive root only — no folder; fixes duplicate listing when a note is filed. */
export async function getRootDriveSheets() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await dbConnect();
  const ownerId = new mongoose.Types.ObjectId(session.user.id);
  const sheets = await Sheet.find({
    $and: [
      { userId: ownerId },
      { $or: [{ organizationId: null }, { organizationId: { $exists: false } }] },
      LIVE_SHEET,
      ROOT_SHEET_FOLDER,
    ],
  })
    .sort({ pinned: -1, sortIndex: 1, updatedAt: -1 })
    .lean();

  return sheets.map(mapDriveSheet);
}

/** Org root only — notes not in a folder. */
export async function getRootOrgSheets(organizationId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  await requireOrgMember(session.user.id, organizationId);

  const orgOid = new mongoose.Types.ObjectId(organizationId);
  const sheets = await Sheet.find({
    $and: [
      { organizationId: orgOid },
      ROOT_SHEET_FOLDER,
      LIVE_SHEET,
    ],
  })
    .sort({ pinned: -1, sortIndex: 1, updatedAt: -1 })
    .lean();

  return sheets.map(mapDriveSheet);
}

export async function getFolderSheets(folderId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const f = await Folder.findOne({ _id: folderId, ...LIVE_FOLDER }).lean();
  if (!f) throw new Error("Folder not found");
  if (f.ownerUserId) {
    if (String(f.ownerUserId) !== session.user.id) throw new Error("Forbidden");
  } else if (f.organizationId) {
    await requireOrgMember(session.user.id, String(f.organizationId));
  } else {
    throw new Error("Forbidden");
  }

  const folderOid = new mongoose.Types.ObjectId(folderId);
  if (f.organizationId) {
    const sheets = await Sheet.find({
      $and: [{ organizationId: f.organizationId }, { folderId: folderOid }, LIVE_SHEET],
    })
      .sort({ pinned: -1, sortIndex: 1, updatedAt: -1 })
      .lean();
    return sheets.map(mapDriveSheet);
  }
  const sheets = await Sheet.find({
    $and: [
      { userId: new mongoose.Types.ObjectId(session.user.id) },
      { $or: [{ organizationId: null }, { organizationId: { $exists: false } }] },
      { folderId: folderOid },
      LIVE_SHEET,
    ],
  })
    .sort({ pinned: -1, sortIndex: 1, updatedAt: -1 })
    .lean();
  return sheets.map(mapDriveSheet);
}

export async function getOrgSheets(organizationId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  await requireOrgMember(session.user.id, organizationId);

  const sheets = await Sheet.find({
    organizationId: new mongoose.Types.ObjectId(organizationId),
    ...LIVE_SHEET,
  })
    .sort({ pinned: -1, sortIndex: 1, updatedAt: -1 })
    .lean();

  return sheets.map(mapDriveSheet);
}

export async function getSharedWithMeSheets() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await dbConnect();
  const uid = new mongoose.Types.ObjectId(session.user.id);
  const grants = await SheetGrant.find({
    granteeUserId: uid,
    via: "share",
  }).lean();

  const roleBySheet = new Map(grants.map((g) => [String(g.sheetId), g.role]));
  const idSet = new Set<string>(grants.map((g) => String(g.sheetId)));

  /** Fallback: accepted email invites should always surface even if grant sync lagged. */
  const email = session.user?.email?.trim().toLowerCase();
  if (email) {
    const acceptedInv = await SheetInvitation.find({
      email,
      acceptedAt: { $exists: true, $ne: null },
      acceptedByUserId: uid,
    })
      .select("sheetId role")
      .lean();
    for (const inv of acceptedInv) {
      const sid = String(inv.sheetId);
      const invRole = typeof inv.role === "string" ? inv.role : "reader";
      if (!idSet.has(sid)) idSet.add(sid);
      if (!roleBySheet.has(sid)) roleBySheet.set(sid, invRole);
    }
  }

  const ids = [...idSet].map((s) => new mongoose.Types.ObjectId(s));
  if (ids.length === 0) return [];

  const sheets = await Sheet.find({
    _id: { $in: ids },
    ...LIVE_SHEET,
  })
    .sort({ updatedAt: -1 })
    .lean();

  return sheets.map((sheet) => ({
    ...mapDriveSheet(sheet),
    role: roleBySheet.get(String(sheet._id)) ?? "reader",
  }));
}

/** Personal or org sheets you own that have at least one email-share grant. */
export async function getSharedByMeSheets() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const mine = await Sheet.find({
    userId: new mongoose.Types.ObjectId(session.user.id),
    ...LIVE_SHEET,
  })
    .select("_id")
    .lean();
  const mineIds = mine.map((m) => m._id);
  if (mineIds.length === 0) return [];

  const sharedIds = await SheetGrant.distinct("sheetId", {
    sheetId: { $in: mineIds },
    via: "share",
  });
  if (!sharedIds.length) return [];

  const sheets = await Sheet.find({ _id: { $in: sharedIds }, ...LIVE_SHEET }).sort({ updatedAt: -1 }).lean();
  return sheets.map(mapDriveSheet);
}

export async function getTrashedSheets() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const sheets = await Sheet.find({
    userId: new mongoose.Types.ObjectId(session.user.id),
    /** `$ne: null` alone also matches missing fields; require a real trash timestamp. */
    deletedAt: { $exists: true, $ne: null },
    $or: [{ organizationId: null }, { organizationId: { $exists: false } }],
  })
    .sort({ deletedAt: -1 })
    .lean();

  return sheets.map(mapDriveSheet);
}

/** @deprecated use getMySheets — kept for incremental refactor */
export async function getSheets() {
  return getMySheets();
}

export async function getSheet(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await dbConnect();
  await requireSheetPermission(session.user.id, id, "read");

  const sheet = await Sheet.findById(id).lean();
  if (!sheet) return null;

  const isOwner = String(sheet.userId) === session.user.id;
  if (sheet.deletedAt && !isOwner) return null;

  const access = await getEffectiveSheetAccess(session.user.id, id);

  const inTrash = !!sheet.deletedAt;
  const canEdit = access ? roleMeets("write", access) : false;
  const canTitleLive = access ? roleMeets("title", access) : false;

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
    inTrash,
    canWrite: inTrash ? false : canEdit,
    canTitle: inTrash ? false : canTitleLive,
  };
}

const MAX_TITLE_LEN = 120;

export async function updateSheetTitle(id: string, title: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const trimmed = title.trim().slice(0, MAX_TITLE_LEN);
  const nextTitle = trimmed.length > 0 ? trimmed : "Untitled Note";

  await dbConnect();
  await requireSheetPermission(session.user.id, id, "title");

  const res = await Sheet.findOneAndUpdate({ _id: id }, { title: nextTitle }, { new: true });

  if (!res) throw new Error("Not found");

  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
  revalidatePath(`/sheet/${id}`);
  return { title: nextTitle };
}

export async function setSheetPinned(id: string, pinned: boolean) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  const sheet = await Sheet.findById(id).lean();
  if (!sheet || String(sheet.userId) !== session.user.id) throw new Error("Forbidden");
  if (sheet.deletedAt) throw new Error("Restore from trash first");
  await Sheet.updateOne({ _id: id }, { $set: { pinned } });
  revalidatePath("/dashboard");
}

export async function moveSheetToTrash(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  await requireSheetPermission(session.user.id, id, "delete");

  const sheet = await Sheet.findById(id).lean();
  if (!sheet) throw new Error("Not found");
  if (sheet.deletedAt) return;

  const isOwner = String(sheet.userId) === session.user.id;
  if (!isOwner) {
    if (!sheet.organizationId) throw new Error("Forbidden");
    await requireOrgAdmin(session.user.id, String(sheet.organizationId));
  }

  await Sheet.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
  revalidatePath("/dashboard", "layout");
  revalidatePath(`/sheet/${id}`);
}

export async function restoreSheetFromTrash(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const sheet = await Sheet.findById(id).lean();
  if (!sheet || !sheet.deletedAt) throw new Error("Not found");
  if (String(sheet.userId) !== session.user.id) {
    if (!sheet.organizationId) throw new Error("Forbidden");
    await requireOrgAdmin(session.user.id, String(sheet.organizationId));
  }

  await Sheet.updateOne({ _id: id }, { $unset: { deletedAt: "" } });
  revalidatePath("/dashboard", "layout");
  revalidatePath(`/sheet/${id}`);
}

export async function permanentlyDeleteSheet(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const sheet = await Sheet.findById(id).lean();
  if (!sheet || !sheet.deletedAt) throw new Error("Only trashed sheets can be purged");

  await requireSheetPermission(session.user.id, id, "delete");
  const isOwner = String(sheet.userId) === session.user.id;
  if (!isOwner) {
    if (!sheet.organizationId) throw new Error("Forbidden");
    await requireOrgAdmin(session.user.id, String(sheet.organizationId));
  }

  await Sheet.findByIdAndDelete(id);
  await SheetGrant.deleteMany({ sheetId: new mongoose.Types.ObjectId(id) });
  revalidatePath("/dashboard", "layout");
}

/** @deprecated Use moveSheetToTrash / permanentlyDeleteSheet */
export async function deleteSheet(id: string) {
  await moveSheetToTrash(id);
}

export async function reorderMyDriveSheets(orderedIds: string[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (!orderedIds.length) return;
  await dbConnect();

  const ids = orderedIds.map((id) => new mongoose.Types.ObjectId(id));
  const found = await Sheet.find({
    _id: { $in: ids },
    userId: new mongoose.Types.ObjectId(session.user.id),
    $and: [{ $or: [{ organizationId: null }, { organizationId: { $exists: false } }] }, LIVE_SHEET],
  })
    .select("_id")
    .lean();

  if (found.length !== ids.length) throw new Error("Invalid sheet list");

  let i = 0;
  for (const id of orderedIds) {
    await Sheet.updateOne({ _id: id }, { $set: { sortIndex: i } });
    i += 1;
  }
  revalidatePath("/dashboard");
}

export async function reorderOrgSheets(organizationId: string, orderedIds: string[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (!orderedIds.length) return;
  await dbConnect();
  await requireOrgMember(session.user.id, organizationId);

  const orgOid = new mongoose.Types.ObjectId(organizationId);
  const ids = orderedIds.map((id) => new mongoose.Types.ObjectId(id));
  const found = await Sheet.find({
    _id: { $in: ids },
    organizationId: orgOid,
    ...LIVE_SHEET,
  })
    .select("_id")
    .lean();

  if (found.length !== ids.length) throw new Error("Invalid sheet list");

  let i = 0;
  for (const id of orderedIds) {
    await Sheet.updateOne({ _id: id }, { $set: { sortIndex: i } });
    i += 1;
  }
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/org/${organizationId}`);
}

export async function saveSheetState(
  id: string,
  canvasState: unknown,
  previewImage?: string,
  clientVersion?: number,
  forceOverwrite?: boolean,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await dbConnect();
  await requireSheetPermission(session.user.id, id, "write");

  const current = await Sheet.findById(id).select("contentVersion deletedAt canvasState").lean();
  if (!current) throw new Error("Not found");
  if (current.deletedAt) throw new Error("Cannot save a trashed note — restore it first");

  const serverV = current.contentVersion ?? 0;
  if (!forceOverwrite && typeof clientVersion === "number" && clientVersion < serverV) {
    return { success: false, conflict: true as const, contentVersion: serverV };
  }

  const nextVersion = serverV + 1;
  let nextCanvasState = canvasState;
  if (
    canvasState &&
    typeof canvasState === "object" &&
    current &&
    typeof (current as { canvasState?: unknown }).canvasState === "object" &&
    (current as { canvasState?: unknown }).canvasState !== null
  ) {
    const incoming = canvasState as { files?: unknown };
    const existing = (current as { canvasState?: { files?: unknown } }).canvasState;
    const incomingFileCount =
      incoming.files && typeof incoming.files === "object" ? Object.keys(incoming.files as Record<string, unknown>).length : 0;
    const referencedBeforeMerge = collectReferencedFileIds(canvasState);
    const existingFiles = existing?.files && typeof existing.files === "object" ? (existing.files as Record<string, unknown>) : null;
    if (incomingFileCount === 0 && existingFiles) {
      const refsCoveredByExisting = [...referencedBeforeMerge].every((id) => id in existingFiles);
      if (refsCoveredByExisting) {
        nextCanvasState = {
          ...(canvasState as Record<string, unknown>),
          files: existingFiles,
        };
      }
    }
  }
  if (nextCanvasState && typeof nextCanvasState === "object") {
    const referenced = collectReferencedFileIds(nextCanvasState);
    const files = (nextCanvasState as { files?: unknown }).files;
    if (referenced.size > 0 && (!files || typeof files !== "object")) {
      throw new Error("Canvas state includes image references but no files payload");
    }
    if (referenced.size > 0 && files && typeof files === "object") {
      for (const id of referenced) {
        if (!(id in (files as Record<string, unknown>))) {
          throw new Error("Canvas state includes orphaned image references");
        }
      }
    }
  }

  const approxBytes = approxStateBytes(nextCanvasState);
  await Sheet.findByIdAndUpdate(id, {
    canvasState: nextCanvasState,
    ...(previewImage && { previewImage }),
    contentVersion: nextVersion,
    approxBytes,
    lastSavedByUserId: new mongoose.Types.ObjectId(session.user.id),
  });
  revalidatePath(`/sheet/${id}`);
  revalidatePath("/dashboard");

  return { success: true as const, contentVersion: nextVersion };
}

export async function moveSheetToFolder(sheetId: string, folderId: string | null, targetOrganizationId?: string | null) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const sheet = await Sheet.findById(sheetId).lean();
  if (!sheet) throw new Error("Not found");
  if (String(sheet.userId) !== session.user.id) throw new Error("Forbidden");
  if (sheet.deletedAt) throw new Error("Restore from trash first");

  let targetOrgId: mongoose.Types.ObjectId | null = null;
  if (folderId) {
    const folder = await Folder.findOne({ _id: folderId, ...LIVE_FOLDER }).lean();
    if (!folder) throw new Error("Folder not found");
    const folderOrgId = folder.organizationId ? String(folder.organizationId) : null;
    if (folderOrgId) {
      await requireOrgMember(session.user.id, folderOrgId);
      targetOrgId = new mongoose.Types.ObjectId(folderOrgId);
    } else if (!folder.ownerUserId || String(folder.ownerUserId) !== session.user.id) {
      throw new Error("Invalid folder");
    }
  } else if (targetOrganizationId) {
    await requireOrgMember(session.user.id, targetOrganizationId);
    targetOrgId = new mongoose.Types.ObjectId(targetOrganizationId);
  }

  await Sheet.updateOne(
    { _id: sheetId, userId: session.user.id },
    {
      folderId: folderId ? new mongoose.Types.ObjectId(folderId) : undefined,
      organizationId: targetOrgId ?? undefined,
    }
  );
  revalidatePath("/dashboard");
  revalidatePath(`/sheet/${sheetId}`);
}

export async function bulkMoveSheets(sheetIds: string[], folderId: string | null) {
  const results: { id: string; ok: true }[] = [];
  const failures: { id: string; error: string }[] = [];
  for (const id of sheetIds) {
    try {
      await moveSheetToFolder(id, folderId);
      results.push({ id, ok: true });
    } catch (e) {
      failures.push({ id, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }
  return { moved: results.length, failed: failures };
}

export async function bulkSetSheetPinned(sheetIds: string[], pinned: boolean) {
  const results: { id: string; ok: true }[] = [];
  const failures: { id: string; error: string }[] = [];
  for (const id of sheetIds) {
    try {
      await setSheetPinned(id, pinned);
      results.push({ id, ok: true });
    } catch (e) {
      failures.push({ id, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }
  return { updated: results.length, failed: failures };
}

export async function bulkMoveSheetsToTrash(sheetIds: string[]) {
  const results: { id: string; ok: true }[] = [];
  const failures: { id: string; error: string }[] = [];
  for (const id of sheetIds) {
    try {
      await moveSheetToTrash(id);
      results.push({ id, ok: true });
    } catch (e) {
      failures.push({ id, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }
  return { trashed: results.length, failed: failures };
}

type PopUser = { _id: mongoose.Types.ObjectId; name?: string; email?: string; image?: string };

export async function getSheetInfo(sheetId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  await requireSheetPermission(session.user.id, sheetId, "read");

  const sheet = await Sheet.findById(sheetId).populate("userId", "name email image").lean();
  if (!sheet) throw new Error("Not found");

  const owner = sheet.userId as unknown as PopUser | undefined;

  const lastSavedByRaw = (sheet as { lastSavedByUserId?: unknown }).lastSavedByUserId;
  let lastSaved: PopUser | undefined;
  if (lastSavedByRaw) {
    const id =
      typeof lastSavedByRaw === "object" && lastSavedByRaw !== null && "_id" in lastSavedByRaw
        ? String((lastSavedByRaw as { _id: unknown })._id)
        : String(lastSavedByRaw);
    const u = await User.findById(id).select("name email image").lean();
    if (u) lastSaved = u as PopUser;
  }

  const grants = await SheetGrant.find({ sheetId: new mongoose.Types.ObjectId(sheetId) })
    .populate("granteeUserId", "name email image")
    .lean();

  let organization: { _id: string; name: string } | null = null;
  if (sheet.organizationId) {
    const o = await Organization.findById(sheet.organizationId).select("name").lean();
    if (o) organization = { _id: String(o._id), name: (o as { name?: string }).name ?? "Organization" };
  }

  const access = await getEffectiveSheetAccess(session.user.id, sheetId);

  return {
    title: sheet.title ?? "Untitled",
    owner: owner
      ? {
          userId: String(owner._id),
          name: owner.name ?? owner.email ?? "User",
          email: owner.email ?? "",
          image: owner.image ?? null,
        }
      : null,
    lastSavedBy: lastSaved
      ? {
          userId: String(lastSaved._id),
          name: lastSaved.name ?? lastSaved.email ?? "User",
          email: lastSaved.email ?? "",
          image: lastSaved.image ?? null,
        }
      : null,
    shares: grants.map((g) => {
      const u = g.granteeUserId as unknown as PopUser | undefined;
      return {
        userId: u ? String(u._id) : String(g.granteeUserId),
        name: u?.name ?? u?.email ?? "User",
        email: u?.email ?? "",
        image: u?.image ?? null,
        role: g.role as string,
        via: g.via as string,
        allowForwardShare: !!g.allowForwardShare,
      };
    }),
    organization,
    yourRole: access?.role ?? "unknown",
    yourActor: access?.actor ?? "unknown",
    orgMemberRole: access?.orgMemberRole ?? null,
    contentVersion: sheet.contentVersion ?? 0,
    approxBytes: typeof sheet.approxBytes === "number" ? sheet.approxBytes : 0,
    createdAt: sheet.createdAt ? new Date(sheet.createdAt).toISOString() : null,
    updatedAt: sheet.updatedAt ? new Date(sheet.updatedAt).toISOString() : null,
    folderId: sheet.folderId ? String(sheet.folderId) : null,
    inTrash: !!sheet.deletedAt,
  };
}
