"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { getRealtimeToken } from "@/lib/actions/socketToken";

export type OnlineMember = { userId: string; name: string; image?: string };
export type DocEditActivity = {
  sheetId: string;
  title?: string;
  userId: string;
  name: string;
  image?: string;
  active: boolean;
};

/**
 * Subscribes to org presence + “who is editing which org sheet” while mounted.
 */
export default function OrgWorkspaceRealtime({
  organizationId,
  userName,
  userImage,
  onOnlineChange,
  onDocActivity,
}: {
  organizationId: string | null;
  userName: string;
  userImage?: string | null;
  onOnlineChange: (users: OnlineMember[]) => void;
  onDocActivity: (bySheet: Record<string, DocEditActivity | null>) => void;
}) {
  const socketRef = useRef<Socket | null>(null);
  const onlineRef = useRef<Record<string, OnlineMember>>({});
  const docRef = useRef<Record<string, DocEditActivity | null>>({});
  const onOnlineRef = useRef(onOnlineChange);
  const onDocRef = useRef(onDocActivity);

  useEffect(() => {
    onOnlineRef.current = onOnlineChange;
    onDocRef.current = onDocActivity;
  }, [onOnlineChange, onDocActivity]);

  useEffect(() => {
    if (!organizationId) {
      onOnlineRef.current([]);
      onDocRef.current({});
      return;
    }

    let cancelled = false;
    const bySheet = docRef.current;

    (async () => {
      try {
        const cfg = await fetch("/api/realtime-config").then((r) => r.json());
        const raw = typeof cfg.url === "string" ? cfg.url.trim() : "";
        const url = raw.length > 0 ? raw : undefined;
        const { token } = await getRealtimeToken();
        const opts = {
          transports: ["websocket", "polling"] as string[],
          auth: { token, name: userName, image: userImage ?? "", color: "#922210" },
        };
        const socket = url ? io(url, opts) : io(opts);
        if (cancelled) {
          socket.disconnect();
          return;
        }
        socketRef.current = socket;
        onlineRef.current = {};
        docRef.current = {};

        socket.emit("joinOrg", organizationId, () => {});

        const syncOnline = () => onOnlineRef.current(Object.values(onlineRef.current));
        const syncDoc = () => onDocRef.current({ ...docRef.current });

        socket.on("org:presence", (p: { userId?: string; name?: string; image?: string; joined?: boolean; left?: boolean }) => {
          if (!p?.userId) return;
          if (p.joined) {
            onlineRef.current[p.userId] = { userId: p.userId, name: p.name ?? "User", image: p.image };
          }
          if (p.left) delete onlineRef.current[p.userId];
          syncOnline();
        });

        socket.on(
          "org:docActivity",
          (p: { sheetId?: string; userId?: string; name?: string; image?: string; title?: string; active?: boolean }) => {
            if (!p?.sheetId || !p.userId) return;
            if (p.active) {
              bySheet[p.sheetId] = {
                sheetId: p.sheetId,
                title: p.title,
                userId: p.userId,
                name: p.name ?? "User",
                image: p.image,
                active: true,
              };
            } else {
              const cur = bySheet[p.sheetId];
              if (cur && cur.userId === p.userId) delete bySheet[p.sheetId];
            }
            syncDoc();
          }
        );
      } catch {
        onOnlineRef.current([]);
        onDocRef.current({});
      }
    })();

    return () => {
      cancelled = true;
      const s = socketRef.current;
      if (s && organizationId) {
        s.emit("leaveOrg", organizationId);
        s.disconnect();
      }
      socketRef.current = null;
      onlineRef.current = {};
      docRef.current = {};
    };
  }, [organizationId, userName, userImage]);

  return null;
}
