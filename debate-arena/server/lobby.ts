import type { CometChatRest } from "./cometchat.js";

export interface Seat {
  uid: string;
  name: string;
  avatar: string;
  joinedAt: number;
}

export const dicebear = (style: string, seed: string, extra = "") =>
  `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}${extra}`;

export function createLobby(opts: { prefix: string; size: number; cc: CometChatRest | null; avatar: (name: string) => string }) {
  const seats = new Map<string, Seat>();
  const pool = Array.from({ length: opts.size }, (_, i) => `${opts.prefix}-p${i + 1}`);

  return {
    pool,
    seats,
    list: () => [...seats.values()].sort((a, b) => a.joinedAt - b.joinedAt),
    freeSeats: () => pool.filter((uid) => !seats.has(uid)),

    async join(rawName: string, preferredUid?: string): Promise<Seat> {
      const name = rawName.trim().slice(0, 18) || "Player";
      const uid = preferredUid;
      if (!uid) throw new Error("A guest session is required");
      if (!seats.has(uid) && seats.size >= opts.size) throw new Error("Room is full");
      const seat: Seat = { uid, name, avatar: opts.avatar(name), joinedAt: seats.get(uid)?.joinedAt ?? Date.now() };
      await opts.cc?.upsertUser(uid, name, seat.avatar);
      seats.set(uid, seat);
      return seat;
    },

    leave(uid: string) {
      seats.delete(uid);
    },
  };
}
