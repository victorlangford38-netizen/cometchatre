import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CometChatConfig } from "./cometchat";
export function resolveCometChat(env: Record<string, string>): CometChatConfig {
  let file: Partial<{ appId: string; region: string; authKey: string }> = {};
  const path = [join(process.cwd(), ".cometchat", "config.json"), join(process.cwd(), "..", ".cometchat", "config.json")].find(existsSync);
  if (path && !env.VERCEL) {
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

