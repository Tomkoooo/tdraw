"use server";

import { auth } from "@/auth";
import dbConnect from "@/lib/db/mongoose";
import Sheet from "@/lib/models/Sheet";
import { revalidatePath } from "next/cache";

export async function createSheet() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await dbConnect();
  
  const newSheet = await Sheet.create({
    userId: session.user.id,
    title: "Untitled Note",
    canvasState: {},
  });

  revalidatePath("/dashboard");
  return newSheet._id.toString();
}

export async function getSheets() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await dbConnect();
  const sheets = await Sheet.find({ userId: session.user.id }).sort({ updatedAt: -1 }).lean();
  
  return sheets.map(sheet => ({
    _id: sheet._id.toString(),
    title: sheet.title,
    updatedAt: sheet.updatedAt ? new Date(sheet.updatedAt).toISOString() : new Date().toISOString(),
    previewImage: sheet.previewImage || null
  }));
}

export async function getSheet(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await dbConnect();
  const sheet = await Sheet.findOne({ _id: id, userId: session.user.id }).lean();
  
  if (!sheet) return null;
  
  return {
    _id: sheet._id.toString(),
    title: sheet.title,
    canvasState: sheet.canvasState,
    updatedAt: sheet.updatedAt ? new Date(sheet.updatedAt).toISOString() : new Date().toISOString(),
  };
}

const MAX_TITLE_LEN = 120;

export async function updateSheetTitle(id: string, title: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const trimmed = title.trim().slice(0, MAX_TITLE_LEN);
  const nextTitle = trimmed.length > 0 ? trimmed : "Untitled Note";

  await dbConnect();
  const res = await Sheet.findOneAndUpdate(
    { _id: id, userId: session.user.id },
    { title: nextTitle },
    { new: true }
  );

  if (!res) throw new Error("Not found");

  revalidatePath("/dashboard");
  revalidatePath(`/sheet/${id}`);
  return { title: nextTitle };
}

export async function saveSheetState(id: string, canvasState: unknown, previewImage?: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await dbConnect();
  await Sheet.findOneAndUpdate(
    { _id: id, userId: session.user.id },
    { canvasState, ...(previewImage && { previewImage }) }
  );

  return { success: true };
}

export async function deleteSheet(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await dbConnect();
  await Sheet.findOneAndDelete({ _id: id, userId: session.user.id });
  revalidatePath("/dashboard");
}
