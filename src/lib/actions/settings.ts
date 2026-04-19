"use server";

import { auth } from "@/auth";
import dbConnect from "@/lib/db/mongoose";
import User from "@/lib/models/User";
import { revalidatePath } from "next/cache";

export async function getHotbarToolIds(): Promise<string[]> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  const u = await User.findById(session.user.id).select("hotbarToolIds").lean();
  return (u?.hotbarToolIds as string[]) ?? [];
}

export async function setHotbarToolIds(toolIds: string[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await dbConnect();
  const uniq = [...new Set(toolIds.filter(Boolean))].slice(0, 40);
  await User.updateOne({ _id: session.user.id }, { $set: { hotbarToolIds: uniq } });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}
