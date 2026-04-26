"use client";

import { useEffect, useMemo, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { getRealtimeToken } from "@/lib/actions/socketToken";

/** One person per userId (any device) for avatars on library cards. */
export type DocPresenceOnCard = {
  userId: string;
  name: string;
  image?: string;
  editing: boolean;
  active: boolean;
};

export type DocPresenceMap = Record<string, DocPresenceOnCard[]>;

type SocketEntry = {
  userId: string;
  name: string;
  image?: string;
  fromSocketId: string;
  active: boolean;
  editing: boolean;
};

type ActivityPayload = {
  sheetId?: string;
  userId?: string;
  name?: string;
  image?: string;
  fromSocketId?: string;
  active?: boolean;
  editing?: boolean;
};

function flatten(
  bySheet: Record<string, Map<string, SocketEntry>>,
  visibleSheetIds: Set<string>,
): DocPresenceMap {
  const out: DocPresenceMap = {};
  for (const sheetId of visibleSheetIds) {
    const m = bySheet[sheetId];
    if (!m || m.size === 0) continue;
    const byUser = new Map<string, DocPresenceOnCard>();
    for (const e of m.values()) {
      if (!e.active) continue;
      const cur = byUser.get(e.userId);
      const editing = Boolean(cur?.editing || e.editing);
      byUser.set(e.userId, {
        userId: e.userId,
        name: e.name,
        image: e.image,
        active: true,
        editing,
      });
    }
    if (byUser.size > 0) {
      out[sheetId] = Array.from(byUser.values());
    }
  }
  return out;
}

/**
 * Subscribes to `doc:activity` for a list of sheet ids (access-checked on server). Used for library / dashboard presence badges.
 */
export default function DocActivityRealtime({
  sheetIds,
  onPresence,
}: {
  sheetIds: string[];
  onPresence: (m: DocPresenceMap) => void;
}) {
  const socketRef = useRef<Socket | null>(null);
  const roomsRef = useRef<Record<string, Map<string, SocketEntry>>>({});
  const onPresenceRef = useRef(onPresence);
  const lastSubKeyRef = useRef<string>("");
  const visibleRef = useRef<Set<string>>(new Set());

  const sheetIdKey = useMemo(() => sheetIds.filter(Boolean).sort().join("\0"), [sheetIds]);

  useEffect(() => {
    onPresenceRef.current = onPresence;
  }, [onPresence]);

  useEffect(() => {
    const set = new Set(sheetIds.filter((id) => id && id.length > 0));
    visibleRef.current = set;
    if (sheetIdKey === lastSubKeyRef.current && socketRef.current?.connected) {
      if (set.size > 0) {
        onPresenceRef.current(flatten(roomsRef.current, set));
      } else {
        onPresenceRef.current({});
      }
      return;
    }
    lastSubKeyRef.current = sheetIdKey;
    if (set.size === 0) {
      onPresenceRef.current({});
      return;
    }

    let cancelled = false;
    let socket: Socket | null = null;
    (async () => {
      try {
        const { token } = await getRealtimeToken();
        const cfg = await fetch("/api/realtime-config").then((r) => r.json());
        const url = typeof cfg.url === "string" && cfg.url.trim().length > 0 ? cfg.url.trim() : undefined;
        const options = { transports: ["websocket", "polling"] as string[], auth: { token } };
        socket = url ? io(url, options) : io(options);
        if (cancelled) {
          socket.disconnect();
          return;
        }
        socketRef.current = socket;

        const applyDocActivity = (p: ActivityPayload) => {
          if (!p?.sheetId || !p.userId) return;
          if (!p.fromSocketId) return;
          if (!set.has(p.sheetId)) return;
          const { sheetId, fromSocketId, userId, name, image, active, editing } = p;
          const m = (roomsRef.current[sheetId] = roomsRef.current[sheetId] ?? new Map());
          if (active === false) {
            m.delete(fromSocketId);
            if (m.size === 0) delete roomsRef.current[sheetId];
          } else {
            m.set(fromSocketId, {
              fromSocketId,
              userId,
              name: name || "User",
              image: typeof image === "string" ? image : undefined,
              active: true,
              editing: Boolean(editing),
            });
          }
          onPresenceRef.current(flatten(roomsRef.current, set));
        };

        const subscribe = () => {
          if (!socket) return;
          const ids = [...set];
          socket.emit("subscribeDocs", ids, () => {
            onPresenceRef.current(flatten(roomsRef.current, set));
          });
        };
        socket.on("connect", subscribe);
        if (socket.connected) subscribe();

        socket.on("doc:activity", (p: ActivityPayload) => applyDocActivity(p));

        socket.on("connect_error", () => {
          onPresenceRef.current({});
        });
      } catch {
        onPresenceRef.current({});
      }
    })();
    return () => {
      cancelled = true;
      if (socket) {
        const ids = Array.from(visibleRef.current);
        if (ids.length) socket.emit("unsubscribeDocs", ids);
        socket.disconnect();
      }
      socketRef.current = null;
      if (set.size) {
        for (const id of set) {
          if (roomsRef.current[id]) delete roomsRef.current[id];
        }
      }
    };
  }, [sheetIdKey, sheetIds]);

  return null;
}
