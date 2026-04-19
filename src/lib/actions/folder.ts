"use server";

import { auth } from "@/auth";
import dbConnect from "@/lib/db/mongoose";
import mongoose from "mongoose";
import Folder from "@/lib/models/Folder";
import FolderAccess from "@/lib/models/FolderAccess";
import { requireOrgMember, requireOrgAdmin } from "@/lib/authz/org";
import type { FolderPermissionLevel } from "@/lib/models/FolderAccess";
import { revalidatePath } from "next/cache";

const LIVE_FOLDER = { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] };

function mapFolder(f: {
  _id: unknown;
  name?: string;
  parentFolderId?: unknown;
  order?: number;
  pinned?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    _id: String(f._id),
    name: f.name ?? "Folder",
    parentFolderId: f.parentFolderId ? String(f.parentFolderId) : null,
    order: f.order ?? 0,
    pinned: !!f.pinned,
    createdAt: f.createdAt ? new Date(f.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: f.updatedAt ? new Date(f.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export async function listFolders(opts: { organizationId?: string; ownerPersonal?: boolean }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  if (opts.organizationId) {
    await requireOrgMember(session.user.id, opts.organizationId);
    const folders = await Folder.find({
      $and: [{ organizationId: new mongoose.Types.ObjectId(opts.organizationId) }, LIVE_FOLDER],
    })
      .sort({ pinned: -1, order: 1, name: 1 })
      .lean();
    return folders.map(mapFolder);
  }

  if (opts.ownerPersonal) {
    const folders = await Folder.find({
      $and: [{ ownerUserId: new mongoose.Types.ObjectId(session.user.id) }, LIVE_FOLDER],
    })
      .sort({ pinned: -1, order: 1, name: 1 })
      .lean();
    return folders.map(mapFolder);
  }

  throw new Error("Missing scope");
}

export async function getTrashedFoldersPersonal() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  const folders = await Folder.find({
    ownerUserId: new mongoose.Types.ObjectId(session.user.id),
    deletedAt: { $exists: true, $ne: null },
  })
    .sort({ deletedAt: -1 })
    .lean();
  return folders.map(mapFolder);
}

export async function createFolder(input: {
  name: string;
  parentFolderId?: string | null;
  organizationId?: string;
  personal?: boolean;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  if (input.organizationId) {
    await requireOrgMember(session.user.id, input.organizationId);
    if (input.parentFolderId) {
      const parent = await Folder.findOne({ _id: input.parentFolderId, ...LIVE_FOLDER }).lean();
      if (!parent || String(parent.organizationId) !== input.organizationId) throw new Error("Invalid parent");
    }
    const fq: Record<string, unknown> = {
      $and: [
        { organizationId: new mongoose.Types.ObjectId(input.organizationId) },
        { ...LIVE_FOLDER },
        input.parentFolderId
          ? { parentFolderId: new mongoose.Types.ObjectId(input.parentFolderId) }
          : { $or: [{ parentFolderId: null }, { parentFolderId: { $exists: false } }] },
      ],
    };
    const lastOrg = await Folder.findOne(fq).sort({ order: -1 }).select("order").lean();
    const nextOrder = typeof lastOrg?.order === "number" ? lastOrg.order + 1 : 0;

    const f = await Folder.create({
      name: input.name.trim().slice(0, 200) || "Folder",
      organizationId: new mongoose.Types.ObjectId(input.organizationId),
      parentFolderId: input.parentFolderId ? new mongoose.Types.ObjectId(input.parentFolderId) : undefined,
      order: nextOrder,
    });
    revalidatePath("/dashboard");
    return f._id.toString();
  }

  if (input.personal) {
    if (input.parentFolderId) {
      const parent = await Folder.findOne({ _id: input.parentFolderId, ...LIVE_FOLDER }).lean();
      if (!parent || String(parent.ownerUserId) !== session.user.id) throw new Error("Invalid parent");
    }
    const pfq: Record<string, unknown> = {
      $and: [
        { ownerUserId: new mongoose.Types.ObjectId(session.user.id) },
        { ...LIVE_FOLDER },
        input.parentFolderId
          ? { parentFolderId: new mongoose.Types.ObjectId(input.parentFolderId) }
          : { $or: [{ parentFolderId: null }, { parentFolderId: { $exists: false } }] },
      ],
    };
    const lastP = await Folder.findOne(pfq).sort({ order: -1 }).select("order").lean();
    const nextOrderP = typeof lastP?.order === "number" ? lastP.order + 1 : 0;

    const f = await Folder.create({
      name: input.name.trim().slice(0, 200) || "Folder",
      ownerUserId: new mongoose.Types.ObjectId(session.user.id),
      parentFolderId: input.parentFolderId ? new mongoose.Types.ObjectId(input.parentFolderId) : undefined,
      order: nextOrderP,
    });
    revalidatePath("/dashboard");
    return f._id.toString();
  }

  throw new Error("Missing scope");
}

export async function setFolderPinned(folderId: string, pinned: boolean) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  const f = await Folder.findById(folderId).lean();
  if (!f) throw new Error("Not found");
  if (f.ownerUserId && String(f.ownerUserId) === session.user.id) {
    if (f.deletedAt) throw new Error("Restore from trash first");
    await Folder.updateOne({ _id: folderId }, { $set: { pinned } });
    revalidatePath("/dashboard");
    return;
  }
  if (f.organizationId) {
    await requireOrgAdmin(session.user.id, String(f.organizationId));
    if (f.deletedAt) throw new Error("Restore from trash first");
    await Folder.updateOne({ _id: folderId }, { $set: { pinned } });
    revalidatePath("/dashboard");
    return;
  }
  throw new Error("Forbidden");
}

export async function moveFolderToTrash(folderId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  const f = await Folder.findById(folderId).lean();
  if (!f || f.deletedAt) throw new Error("Not found");
  if (f.ownerUserId && String(f.ownerUserId) === session.user.id) {
    await Folder.updateOne({ _id: folderId }, { $set: { deletedAt: new Date() } });
    revalidatePath("/dashboard");
    return;
  }
  if (f.organizationId) {
    await requireOrgAdmin(session.user.id, String(f.organizationId));
    await Folder.updateOne({ _id: folderId }, { $set: { deletedAt: new Date() } });
    revalidatePath("/dashboard");
    return;
  }
  throw new Error("Forbidden");
}

export async function restoreFolderFromTrash(folderId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  const f = await Folder.findById(folderId).lean();
  if (!f || !f.deletedAt) throw new Error("Not found");
  if (f.ownerUserId && String(f.ownerUserId) === session.user.id) {
    await Folder.updateOne({ _id: folderId }, { $unset: { deletedAt: "" } });
    revalidatePath("/dashboard");
    return;
  }
  if (f.organizationId) {
    await requireOrgAdmin(session.user.id, String(f.organizationId));
    await Folder.updateOne({ _id: folderId }, { $unset: { deletedAt: "" } });
    revalidatePath("/dashboard");
    return;
  }
  throw new Error("Forbidden");
}

export async function permanentlyDeleteFolder(folderId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  const f = await Folder.findById(folderId).lean();
  if (!f?.deletedAt) throw new Error("Only trashed folders can be purged");
  if (f.ownerUserId && String(f.ownerUserId) === session.user.id) {
    await Folder.deleteOne({ _id: folderId });
    revalidatePath("/dashboard");
    return;
  }
  if (f.organizationId) {
    await requireOrgAdmin(session.user.id, String(f.organizationId));
    await Folder.deleteOne({ _id: folderId });
    revalidatePath("/dashboard");
    return;
  }
  throw new Error("Forbidden");
}

export async function setFolderAccess(
  folderId: string,
  targetUserId: string,
  level: FolderPermissionLevel,
  organizationId: string
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  await requireOrgAdmin(session.user.id, organizationId);

  const folder = await Folder.findById(folderId).lean();
  if (!folder || String(folder.organizationId) !== organizationId) throw new Error("Invalid folder");

  await FolderAccess.findOneAndUpdate(
    { folderId: new mongoose.Types.ObjectId(folderId), userId: new mongoose.Types.ObjectId(targetUserId) },
    { $set: { level } },
    { upsert: true }
  );
  revalidatePath("/dashboard");
}

/** Owner assigns another user visibility on a personal folder (shared drive ACL). */
export async function setPersonalFolderAccess(folderId: string, targetUserId: string, level: FolderPermissionLevel) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();

  const folder = await Folder.findById(folderId).lean();
  if (!folder || !folder.ownerUserId || String(folder.ownerUserId) !== session.user.id) {
    throw new Error("Forbidden");
  }

  await FolderAccess.findOneAndUpdate(
    { folderId: new mongoose.Types.ObjectId(folderId), userId: new mongoose.Types.ObjectId(targetUserId) },
    { $set: { level } },
    { upsert: true }
  );
  revalidatePath("/dashboard");
}

/** Reorder personal root folders (same parent: null). */
export async function reorderPersonalFolders(orderedIds: string[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (!orderedIds.length) return;
  await dbConnect();

  const uid = new mongoose.Types.ObjectId(session.user.id);
  const ids = orderedIds.map((id) => new mongoose.Types.ObjectId(id));
  const found = await Folder.find({
    _id: { $in: ids },
    ownerUserId: uid,
    $and: [{ $or: [{ parentFolderId: null }, { parentFolderId: { $exists: false } }] }, LIVE_FOLDER],
  })
    .select("_id")
    .lean();

  if (found.length !== ids.length) throw new Error("Invalid folder list");

  let i = 0;
  for (const id of orderedIds) {
    await Folder.updateOne({ _id: id }, { $set: { order: i } });
    i += 1;
  }
  revalidatePath("/dashboard");
}
