import type { CometChatRest } from "./cometchat";

export interface Seat {
  uid: string;
  name: string;
  avatar: string;
  joinedAt: number;
}

export const dicebear = (style: string, seed: string, extra = "") =>
  `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}${extra}`;

/**
 * Seats are a fixed pool of CometChat UIDs (`<prefix>-p1..pN`) that get renamed to
 * whoever sits in them, so no user management is needed between games.
 */
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
      let uid = preferredUid && pool.includes(preferredUid) ? preferredUid : undefined;
      if (uid && seats.has(uid) && seats.get(uid)!.name !== name) uid = undefined;
      uid ??= pool.find((u) => !seats.has(u));
      if (!uid) throw new Error("Room is full");
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
