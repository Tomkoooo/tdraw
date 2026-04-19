"use server";

import { auth } from "@/auth";
import { signRealtimeUserToken } from "@/lib/realtime/hmacToken";

/**
 * Short-lived signed token for Socket.io (verified in `attachSocketIo` / standalone realtime).
 */
export async function getRealtimeToken(): Promise<{ token: string; expiresIn: number }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not configured");

  return signRealtimeUserToken(secret, session.user.id, 600);
}
