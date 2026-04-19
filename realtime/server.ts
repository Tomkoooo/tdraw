/**
 * Standalone realtime service (Socket.io only).
 * Run: `npm run realtime` — set REALTIME_PUBLIC_URL in the Next app when using a separate port.
 */
import { createServer } from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { attachSocketIo } from "../src/lib/realtime/attachSocketIo";

const PORT = Number(process.env.REALTIME_PORT ?? 3001);
const MONGODB_URI = process.env.MONGODB_URI;

async function main() {
  if (!MONGODB_URI) {
    console.error("REALTIME: MONGODB_URI required");
    process.exit(1);
  }
  await mongoose.connect(MONGODB_URI);
  console.info("REALTIME: mongoose connected");

  const httpServer = createServer((_, res) => {
    res.writeHead(200);
    res.end("tDraw realtime");
  });

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: true, credentials: true },
  });
  attachSocketIo(io);

  httpServer.listen(PORT, () => {
    console.info(`REALTIME: listening on ${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
