import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createCometChatRest, type CometChatConfig, type CometChatRest } from "./cometchat";
import { createLlm, resolveLlmConfig, type Llm } from "./llm";

export type Pace = "demo" | "normal";

export interface Hub {
  /** Push fresh per-player state to every connected tab (coalesced). */
  broadcast(): void;
  /** Fire a transient effect (typing, emoji burst, sound cue) to all or some players. */
  fx(event: Record<string, unknown>, uids?: string[]): void;
  connected(): Set<string>;
}

export interface GameContext {
  cc: CometChatRest | null;
  llm: Llm;
  hub: Hub;
  pace: Pace;
}

export interface GameModule {
  routes: Record<string, (body: any) => unknown | Promise<unknown>>;
  viewFor(uid: string | null): unknown;
  onDisconnect?(uid: string): void;
}

export type CreateGame = (ctx: GameContext) => GameModule;

function resolveCometChat(env: Record<string, string>): CometChatConfig {
  let file: Partial<{ appId: string; region: string; authKey: string }> = {};
  const path = [join(process.cwd(), ".cometchat", "config.json"), join(process.cwd(), "..", ".cometchat", "config.json")].find(existsSync);
  if (path) {
    try {
      file = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      /* ignore malformed CLI config */
    }
  }
  return {
    appId: env.VITE_COMETCHAT_APP_ID || env.COMETCHAT_APP_ID || file.appId || "",
    region: env.VITE_COMETCHAT_REGION || env.COMETCHAT_REGION || file.region || "us",
    authKey: env.VITE_COMETCHAT_AUTH_KEY || env.COMETCHAT_AUTH_KEY || file.authKey || "",
    restKey: env.COMETCHAT_REST_API_KEY || "",
  };
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export function gameServer(env: Record<string, string>, createGame: CreateGame): Plugin {
  const ccConfig = resolveCometChat(env);
  const llmConfig = resolveLlmConfig(env);
  const llm = createLlm(llmConfig);
  const missing = [
    !ccConfig.appId && "App ID",
    !ccConfig.authKey && "Auth Key",
    !ccConfig.restKey && "REST API Key",
  ].filter(Boolean) as string[];
  const cc = missing.length ? null : createCometChatRest(ccConfig);

  const clients = new Set<{ uid: string | null; res: ServerResponse }>();
  let game: GameModule;
  let pending: NodeJS.Timeout | null = null;

  const write = (res: ServerResponse, event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const hub: Hub = {
    broadcast() {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        for (const c of clients) write(c.res, "state", game.viewFor(c.uid));
      }, 30);
    },
    fx(event, uids) {
      for (const c of clients) if (!uids || (c.uid && uids.includes(c.uid))) write(c.res, "fx", event);
    },
    connected() {
      return new Set([...clients].map((c) => c.uid).filter(Boolean) as string[]);
    },
  };

  game = createGame({ cc, llm, hub, pace: env.GAME_PACE === "demo" ? "demo" : "normal" });

  console.log(
    `\n  CometChat: ${cc ? `app ${ccConfig.appId} (${ccConfig.region})` : `missing ${missing.join(", ")}`}\n  LLM: ${llm.label}\n`,
  );

  return {
    name: "game-server",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://local");
        if (!url.pathname.startsWith("/api/")) return next();
        const route = url.pathname.slice(5);

        if (route === "config") {
          return send(res, 200, {
            appId: ccConfig.appId,
            region: ccConfig.region,
            authKey: ccConfig.authKey,
            missing,
            llm: llm.label,
          });
        }

        if (route === "stream") {
          const uid = url.searchParams.get("uid") || null;
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          const client = { uid, res };
          clients.add(client);
          write(res, "state", game.viewFor(uid));
          const ping = setInterval(() => res.write(": ping\n\n"), 15000);
          req.on("close", () => {
            clearInterval(ping);
            clients.delete(client);
            if (uid && !hub.connected().has(uid)) game.onDisconnect?.(uid);
            hub.broadcast();
          });
          hub.broadcast();
          return;
        }

        const handler = game.routes[route];
        if (!handler || req.method !== "POST") return send(res, 404, { error: "not found" });
        try {
          const result = await handler(await readBody(req));
          hub.broadcast();
          send(res, 200, result ?? { ok: true });
        } catch (e) {
          console.error(`[api/${route}]`, e);
          send(res, 400, { error: (e as Error).message });
        }
      });
    },
  };
}
