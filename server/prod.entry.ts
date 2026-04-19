import http from "http";
import { parse } from "url";
import path from "path";
import next from "next";
import { Server } from "socket.io";
import mongoose from "mongoose";
import { attachSocketIo } from "../src/lib/realtime/attachSocketIo";

const port = parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const dir = path.join(__dirname, "..");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI required");
    process.exit(1);
  }

  const app = next({ dev: false, hostname, port, dir });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = http.createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Request error", err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: true, credentials: true },
  });

  await mongoose.connect(uri);
  console.info("mongoose connected (unified server)");
  attachSocketIo(io);

  httpServer.listen(port, hostname, () => {
    console.info(`> Ready on http://${hostname}:${port} (Next + Socket.io)`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
