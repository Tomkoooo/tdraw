import http from "http";
import { parse } from "url";
import path from "path";
import next from "next";
import { loadEnvConfig } from "@next/env";
import { Server as SocketIoServer } from "socket.io";
import mongoose from "mongoose";
import { attachSocketIo } from "../src/lib/realtime/attachSocketIo";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

// Use 0.0.0.0 by default in production to ensure accessibility inside Docker/Proxies
const hostname = process.env.HOSTNAME || (dev ? "localhost" : "0.0.0.0");
const dir = path.join(__dirname, "..");

async function main() {
  // Match Next.js env loading order so custom server and app routes read the same values.
  loadEnvConfig(dir, dev);

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("ENVIRONMENT ERROR: MONGODB_URI is required");
    process.exit(1);
  }

  console.info(`> [SERVER] Mode: ${dev ? "Development" : "Production"}`);
  console.info(`> [SERVER] Binding: ${hostname}:${port}`);

  // 1. Initialize Next.js
  const app = next({ dev, hostname, port, dir });
  const handle = app.getRequestHandler();

  try {
    await app.prepare();
    console.info("> [SERVER] Next.js prepared");
  } catch (err) {
    console.error("> [SERVER] Failed to prepare Next.js:", err);
    process.exit(1);
  }

  // 2. Create HTTP server
  const httpServer = http.createServer();

  // 3. Initialize Socket.io
  // We attach it to the httpServer BEFORE adding the request listener
  const io = new SocketIoServer(httpServer, {
    path: "/socket.io",
    cors: {
      // Relaxed CORS for production troubleshooting - adjust once working
      origin: true, 
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Transports: attempt websocket first, but keep polling as fallback for proxies
    transports: ["websocket", "polling"],
    allowEIO3: true, // For compatibility if needed
    connectTimeout: 45000,
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  // 4. Attach Next.js to HTTP server
  httpServer.on("request", async (req, res) => {
    try {
      // Socket.io installs its own request handler on this server.
      // If we forward those same requests to Next.js, polling requests
      // get double-handled and crash with ERR_HTTP_HEADERS_SENT.
      if (req.url?.startsWith("/socket.io")) {
        return;
      }

      const parsedUrl = parse(req.url!, true);
      // Optional: Add logging for socket path hits if needed for debugging
      // if (req.url?.startsWith('/socket.io/')) {
      //   console.debug(`> [DEBUG] Socket request: ${req.url}`);
      // }
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("> [SERVER] Request handling error:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  // 5. Connect to Database
  try {
    console.info("> [SERVER] Connecting to MongoDB...");
    await mongoose.connect(uri);
    console.info("> [SERVER] MongoDB connected");
  } catch (dbErr) {
    console.error("> [SERVER] MongoDB connection failed:", dbErr);
    process.exit(1);
  }

  // 6. Attach socket business logic
  attachSocketIo(io);
  console.info("> [SERVER] Socket.io handlers attached");

  // 7. Start listening
  httpServer.listen(port, hostname, () => {
    console.info(`> [SERVER] Ready on http://${hostname}:${port}`);
    console.info(`> [SERVER] Realtime active at /socket.io/`);
  });

  // Handle server errors
  httpServer.on("error", (err) => {
    console.error("> [SERVER] HTTP Server Error:", err);
  });
}

main().catch((err) => {
  console.error("> [SERVER] Fatal error during startup:", err);
  process.exit(1);
});
