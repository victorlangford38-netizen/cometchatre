import type { Plugin } from "vite";
import { createHandler } from "./http";
export function gameServer(env: Record<string, string>): Plugin {
  const handler = createHandler(env);
  return { name: "arena-api", configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith("/api/")) return next();
      void handler(req, res);
    });
  } };
}
