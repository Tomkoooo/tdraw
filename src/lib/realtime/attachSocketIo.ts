import mongoose from "mongoose";
import type { Server } from "socket.io";
import { verifyRealtimeUserToken } from "./hmacToken";

const SheetSchema = new mongoose.Schema({}, { strict: false, collection: "sheets" });
const SheetGrantSchema = new mongoose.Schema({}, { strict: false, collection: "sheetgrants" });
const OrgMemberSchema = new mongoose.Schema({}, { strict: false, collection: "organizationmembers" });

async function canAccessSheet(userId: string, sheetId: string): Promise<boolean> {
  const Sheet = mongoose.models.RTSheet || mongoose.model("RTSheet", SheetSchema);
  const SheetGrant = mongoose.models.RTSheetGrant || mongoose.model("RTSheetGrant", SheetGrantSchema);
  const OrgMember = mongoose.models.RTOrgMember || mongoose.model("RTOrgMember", OrgMemberSchema);

  const sheet = await Sheet.findById(sheetId).lean();
  if (!sheet) return false;
  if (String((sheet as { userId?: unknown }).userId) === userId) return true;

  const grant = await SheetGrant.findOne({
    sheetId: new mongoose.Types.ObjectId(sheetId),
    granteeUserId: new mongoose.Types.ObjectId(userId),
  }).lean();
  if (grant) return true;

  const orgId = (sheet as { organizationId?: unknown }).organizationId;
  if (orgId) {
    const m = await OrgMember.findOne({
      organizationId: orgId,
      userId: new mongoose.Types.ObjectId(userId),
    }).lean();
    return !!m;
  }
  return false;
}

async function canAccessOrg(userId: string, organizationId: string): Promise<boolean> {
  const OrgMember = mongoose.models.RTOrgMember || mongoose.model("RTOrgMember", OrgMemberSchema);
  const m = await OrgMember.findOne({
    organizationId: new mongoose.Types.ObjectId(organizationId),
    userId: new mongoose.Types.ObjectId(userId),
  }).lean();
  return !!m;
}

/**
 * Registers Socket.io auth + sheet presence handlers (shared by unified Next server and standalone realtime).
 */
export function attachSocketIo(io: Server): void {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET required for realtime");

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== "string") return next(new Error("Unauthorized"));
    const v = verifyRealtimeUserToken(token, secret);
    if (!v) return next(new Error("Unauthorized"));
    socket.data.userId = v.userId;
    next();
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    const name = (socket.handshake.auth?.name as string) || "User";
    const color = (socket.handshake.auth?.color as string) || "#0071E3";
    const image = typeof socket.handshake.auth?.image === "string" ? socket.handshake.auth.image : "";

    const emitOrgDocInactive = (orgId: string, sheetId: string) => {
      io.to(`org:${orgId}`).emit("org:docActivity", {
        type: "editing",
        sheetId,
        userId,
        name,
        image,
        active: false,
      });
    };

    socket.on("joinOrg", async (organizationId: string, ack?: (r: { ok: boolean; error?: string }) => void) => {
      try {
        if (!organizationId || typeof organizationId !== "string") throw new Error("bad org");
        const ok = await canAccessOrg(userId, organizationId);
        if (!ok) throw new Error("forbidden");
        socket.join(`org:${organizationId}`);
        if (!socket.data.orgRooms) socket.data.orgRooms = new Set<string>();
        (socket.data.orgRooms as Set<string>).add(organizationId);
        io.to(`org:${organizationId}`).emit("org:presence", { userId, name, image, joined: true });
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: String((e as Error)?.message || e) });
      }
    });

    socket.on("leaveOrg", (organizationId: string) => {
      if (!organizationId) return;
      socket.leave(`org:${organizationId}`);
      (socket.data.orgRooms as Set<string> | undefined)?.delete(organizationId);
      io.to(`org:${organizationId}`).emit("org:presence", { userId, left: true });
    });

    socket.on("joinSheet", async (sheetId: string, ack?: (r: { ok: boolean; error?: string }) => void) => {
      try {
        if (!sheetId || typeof sheetId !== "string") throw new Error("bad id");
        const ok = await canAccessSheet(userId, sheetId);
        if (!ok) throw new Error("forbidden");
        socket.join(`sheet:${sheetId}`);
        socket.data.activeSheet = sheetId;
        io.to(`sheet:${sheetId}`).emit("presence:list", { userId, name, color, image, joined: true });

        const Sheet = mongoose.models.RTSheet || mongoose.model("RTSheet", SheetSchema);
        const sheet = await Sheet.findById(sheetId).select("organizationId title").lean();
        const oid = sheet && (sheet as { organizationId?: unknown }).organizationId;
        if (oid) {
          const orgIdStr = String(oid);
          const member = await canAccessOrg(userId, orgIdStr);
          if (member) {
            socket.data.docActivity = { orgId: orgIdStr, sheetId };
            io.to(`org:${orgIdStr}`).emit("org:docActivity", {
              type: "editing",
              sheetId,
              title: (sheet as { title?: string }).title ?? "Note",
              userId,
              name,
              image,
              active: true,
            });
          }
        }

        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: String((e as Error)?.message || e) });
      }
    });

    socket.on("leaveSheet", (sheetId: string) => {
      if (!sheetId) return;
      socket.leave(`sheet:${sheetId}`);
      io.to(`sheet:${sheetId}`).emit("presence:list", { userId, left: true });

      const da = socket.data.docActivity as { orgId?: string; sheetId?: string } | undefined;
      if (da && da.sheetId === sheetId && da.orgId) {
        emitOrgDocInactive(da.orgId, sheetId);
      }
      socket.data.docActivity = undefined;
    });

    socket.on("presence:cursor", (payload: { sheetId?: string; pageId?: string; x?: number; y?: number }) => {
      const { sheetId, pageId, x, y } = payload || {};
      if (!sheetId || socket.data.activeSheet !== sheetId) return;
      socket.to(`sheet:${sheetId}`).emit("presence:cursor", { userId, name, color, image, pageId, x, y });
    });

    socket.on(
      "sheet:snapshot",
      (payload: { sheetId?: string; snapshot?: unknown; contentVersion?: number }) => {
        const { sheetId, snapshot, contentVersion } = payload || {};
        if (!sheetId || socket.data.activeSheet !== sheetId) return;
        socket.to(`sheet:${sheetId}`).emit("sheet:snapshot", { snapshot, contentVersion, fromUserId: userId });
      },
    );

    socket.on("disconnect", () => {
      const sid = socket.data.activeSheet as string | undefined;
      if (sid) {
        io.to(`sheet:${sid}`).emit("presence:list", { userId, left: true });
      }
      const da = socket.data.docActivity as { orgId?: string; sheetId?: string } | undefined;
      if (da?.orgId && da.sheetId) {
        emitOrgDocInactive(da.orgId, da.sheetId);
      }
      const rooms = socket.data.orgRooms as Set<string> | undefined;
      if (rooms) {
        for (const orgId of rooms) {
          io.to(`org:${orgId}`).emit("org:presence", { userId, left: true });
        }
      }
    });
  });

  if (process.env.ENABLE_CHANGE_STREAMS === "1") {
    try {
      const Sheet = mongoose.models.RTSheet || mongoose.model("RTSheet", SheetSchema);
      const change = Sheet.watch([], { fullDocument: "updateLookup" });
      change.on("change", (ev) => {
        const id = ev.documentKey?._id?.toString();
        if (!id) return;
        io.to(`sheet:${id}`).emit("sheet:changed", { sheetId: id, at: Date.now() });
      });
      console.info("REALTIME: Change Streams enabled (replica set required)");
    } catch (e) {
      console.warn("REALTIME: Change Streams unavailable (needs replica set):", (e as Error)?.message || e);
    }
  }
}
