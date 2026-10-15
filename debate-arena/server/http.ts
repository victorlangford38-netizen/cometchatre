import type { IncomingMessage, ServerResponse } from "node:http";
import { createService } from "./service.js";
import { PublicError } from "./store.js";
export function createHandler(env: Record<string, string>) {
  const service = createService(env);
  return async (req: IncomingMessage & { body?: unknown }, res: ServerResponse) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const route = new URL(req.url ?? "/", "http://local").pathname.slice(5);
      if (req.method !== (route === "config" ? "GET" : "POST")) throw new PublicError("Method not allowed", 405);
      let body: any = req.body;
      if (body === undefined) {
        let raw = "";
        for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 8192) throw new PublicError("Request is too large", 413); }
        try { body = raw ? JSON.parse(raw) : {}; } catch { throw new PublicError("Invalid JSON"); }
      }
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { throw new PublicError("Invalid JSON"); } }
      if (!body || Array.isArray(body) || typeof body !== "object" || Buffer.byteLength(JSON.stringify(body)) > 8192) throw new PublicError("Invalid request");
      const auth = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
      const ip = env.VERCEL ? String(req.headers["x-vercel-forwarded-for"] ?? req.headers["x-forwarded-for"] ?? "unknown").split(",")[0] : req.socket.remoteAddress ?? "local";
      res.statusCode = 200;
      res.end(JSON.stringify(await service.request(route, body, auth, ip)));
    } catch (e) {
      res.statusCode = e instanceof PublicError ? e.status : 400;
      const message = e instanceof PublicError ? e.message : e instanceof Error && /^(Both podiums|Room is full|A debate is live|That podium)/.test(e.message) ? e.message : "The request could not finish. Please try again.";
      if (!(e instanceof PublicError)) console.error("[arena request]", e instanceof Error ? e.name : "Error");
      res.end(JSON.stringify({ error: message }));
    }
  };
}
