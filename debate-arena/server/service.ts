import { createHash } from "node:crypto";
import { createGame } from "./game";
import { resolveCometChat } from "./config";
import { createCometChatRest, type CometChatRest } from "./cometchat";
import { createLlm, resolveLlmConfig, type Llm } from "./llm";
import { FileStore, RedisStore, PublicError, type Store, type RoomRecord } from "./store";
import type { GameView } from "../shared/types";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const HOST = new Set(["start", "reset", "rematch", "pin"]);
const ACTIONS = new Set(["state", "join", "role", "start", "reset", "rematch", "pin", "leave", "message", "typing", "hype", "vote"]);
export function createService(env: Record<string, string>, injected?: { store: Store; cc: CometChatRest; llm: Llm }) {
  const config = resolveCometChat(env);
  const redisUrl = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const redisToken = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  const missing = [!config.appId && "COMETCHAT_APP_ID", !config.restKey && "COMETCHAT_REST_API_KEY",
    env.VERCEL && !(redisUrl && redisToken) && "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN"].filter(Boolean) as string[];
  const cc = injected?.cc ?? createCometChatRest(config);
  const llm = injected?.llm ?? createLlm(resolveLlmConfig(env));
  const store = injected?.store ?? (redisUrl && redisToken ? new RedisStore(redisUrl, redisToken) : env.VERCEL ? null : new FileStore());
  const pace = env.GAME_PACE === "demo" ? "demo" : "normal";
  const empty = () => createGame({ cc, llm, pace, hub: { broadcast() {}, fx() {}, connected: () => new Set() } });
  return {
    async request(route: string, body: Record<string, any>, token: string, ip: string): Promise<any> {
      if (route === "config") return { appId: config.appId, region: config.region, missing, llm: llm.label };
      if ((!injected && missing.length) || !store) throw new PublicError("This arena is not configured yet. Please contact its host.", 503);
      if (!ACTIONS.has(route) && route !== "create") throw new PublicError("Not found", 404);
      if (route === "state" && !body.room) return { state: { ...empty().viewFor(null) as GameView, roomId: null, hostUid: null }, effects: [] };
      const roomId = body.room;
      if (typeof roomId !== "string" || !/^[a-zA-Z0-9_-]{16,64}$/.test(roomId)) throw new PublicError("This invite link is invalid.");
      if (!/^[a-zA-Z0-9_-]{32,100}$/.test(token)) throw new PublicError("A guest session is required. Reload the page.", 401);
      const session = hash(token);
      if (["create", "join"].includes(route)) await store.rate(`join:${hash(ip)}`, 30, 3600);
      if (route === "create") await store.rate(`create:${hash(ip)}`, 10, 3600);
      return store.transaction(roomId, async existing => {
        const now = Date.now();
        if (existing && existing.expiresAt <= now) throw new PublicError("This room has expired. Create a new arena.", 410);
        if (!existing && route !== "create") throw new PublicError("This room does not exist or has expired.", 404);
        if (existing && route === "create" && existing.host !== session) throw new PublicError("This arena already exists.", 409);
        const room: RoomRecord = existing ?? { expiresAt: now + 86400000, host: session, members: {}, game: null, messages: [], effects: [], sequence: 0 };
        let member = room.members[session];
        if (!member && !["state", "join", "create"].includes(route)) throw new PublicError("Join this arena first.", 401);
        if (member) member.seenAt = now;
        if (member && room.members[room.host]?.seenAt < now - 90000) room.host = session;
        if (HOST.has(route) && room.host !== session) throw new PublicError("Only the room host can do that.", 403);
        const game = createGame({ cc, llm, pace, saved: room.game, hub: {
          broadcast() {},
          fx(event) { room.effects.push({ id: ++room.sequence, at: Date.now(), event }); },
          connected: () => new Set(Object.values(room.members).filter(m => m.seenAt > Date.now() - 20000).map(m => m.uid)),
        } });
        if (member && route !== "message") await game.tick();
        let value: any = { ok: true };
        if (route === "join" || route === "create") {
          if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 60) throw new PublicError("Enter a name (up to 18 characters).");
          const uid = member?.uid ?? `da-${hash(roomId + token).slice(0, 24)}`;
          const seat: any = await game.routes.join({ name: body.name, uid });
          if (!member) {
            const auth = await cc.createToken(uid);
            if (!auth.authToken) throw new PublicError("Chat login could not be created. Please retry.", 503);
            member = room.members[session] = { uid, authToken: auth.authToken, seenAt: now, lastAction: {} };
          }
          value = { ...seat, authToken: member.authToken, roomId };
        } else if (route === "state") {
          value = { state: { ...game.viewFor(member?.uid ?? null) as GameView, roomId, hostUid: room.members[room.host]?.uid ?? null },
            effects: member ? room.effects.filter(e => e.id > (Number(body.after) || 0) && e.at > now - 5000) : [] };
        } else {
          if (!member) throw new PublicError("Join this arena first.", 401);
          const delay = route === "message" ? 1200 : route === "hype" ? 200 : route === "typing" ? 1000 : 300;
          if (now - (member.lastAction[route] ?? 0) < delay) throw new PublicError("Please wait a moment before trying again.", 429);
          if (route === "message") {
            const id = String(body.id ?? "");
            if (!/^\d{1,30}$/.test(id)) throw new PublicError("A valid chat message is required.");
            if (!room.messages.includes(id)) {
              if (room.messages.length >= 160) throw new PublicError("This debate has reached its message limit.");
              const message = await cc.getMessage(id);
              const view = game.viewFor(member.uid) as GameView;
              if (message.sender !== member.uid || message.receiver !== view.groupGuid || message.receiverType !== "group" || message.type !== "text" || message.category !== "message") throw new PublicError("That message does not belong to you in this debate.", 403);
              const sentAt = Number(message.sentAt) * 1000;
              if (view.phase !== "round" && view.phase !== "deliberating") throw new PublicError("Scoring is closed for this debate.");
              const elapsed = view.rounds.slice(0, view.phase === "round" ? view.roundIndex : view.rounds.length).reduce((sum, round) => sum + round.secs * 1000, 0);
              const opened = view.phaseStartedAt - elapsed;
              const closed = opened + view.rounds.reduce((sum, round) => sum + round.secs * 1000, 0);
              if (!Number.isFinite(sentAt) || sentAt < opened - 1000 || sentAt > Math.min(now + 1000, closed)) throw new PublicError("This message is outside the active round.");
              await game.routes.message({ uid: member.uid, receiverType: "group", receiver: view.groupGuid, text: String(message.data?.text ?? "") });
              room.messages.push(id);
            }
          } else {
            if (route === "leave" && (game.viewFor(member.uid) as GameView).phase !== "lobby") throw new PublicError("Return to the lobby before leaving this seat.");
            await game.routes[route]({ ...body, uid: member.uid });
            if (["reset", "rematch"].includes(route)) room.messages = [];
            if (route === "leave") { delete room.members[session]; if (room.host === session) room.host = Object.keys(room.members)[0] ?? ""; }
          }
          member.lastAction[route] = now;
        }
        await game.flush();
        room.game = game.snapshot();
        room.effects = room.effects.filter(e => e.at > now - 10000).slice(-80);
        if (!room.host && member && route === "join") room.host = session;
        return { room, value };
      });
    },
  };
}
