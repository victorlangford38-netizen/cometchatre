import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { gameServer } from "./server/plugin";
import { createGame } from "./server/game";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, "..", ""), ...loadEnv(mode, process.cwd(), "") };
  return {
    plugins: [react(), gameServer(env, createGame)],
    server: { host: true, port: 5175 },
  };
});
