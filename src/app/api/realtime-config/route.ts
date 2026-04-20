import { NextResponse } from "next/server";

/**
 * Runtime URL for Socket.io. Empty string means same origin (unified Next + Socket.io server).
 * Set REALTIME_PUBLIC_URL or NEXT_PUBLIC_REALTIME_URL when running a separate realtime process (e.g. `npm run realtime`).
 */
export async function GET() {
  const url =
    process.env.NEXT_PUBLIC_REALTIME_URL || process.env.REALTIME_PUBLIC_URL || "";
    
  console.debug(`> [API] /api/realtime-config called. Returning URL: "${url}"`);
  return NextResponse.json({ url });
}
