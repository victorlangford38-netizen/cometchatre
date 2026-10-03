import { useEffect, useRef, useState } from "react";

export interface AppConfig {
  appId: string;
  region: string;
  authKey: string;
  missing: string[];
  llm: string;
}

export async function api<T = any>(route: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`/api/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json as T;
}

export const getConfig = (): Promise<AppConfig> => fetch("/api/config").then((r) => r.json());

type FxHandler = (fx: any) => void;
const fxHandlers = new Set<FxHandler>();

/** Subscribe to transient server effects (typing, prompts, emoji bursts...). */
export function useFx(handler: FxHandler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const h: FxHandler = (fx) => ref.current(fx);
    fxHandlers.add(h);
    return () => {
      fxHandlers.delete(h);
    };
  }, []);
}

let clockOffset = 0;
export const serverNow = () => Date.now() + clockOffset;

/** Live, per-player game state streamed from the server over SSE. */
export function useGameState<T extends { serverNow: number }>(uid: string | null) {
  const [state, setState] = useState<T | null>(null);
  useEffect(() => {
    const es = new EventSource(`/api/stream${uid ? `?uid=${encodeURIComponent(uid)}` : ""}`);
    es.addEventListener("state", (e) => {
      const next = JSON.parse((e as MessageEvent).data) as T;
      clockOffset = next.serverNow - Date.now();
      setState(next);
    });
    es.addEventListener("fx", (e) => {
      const fx = JSON.parse((e as MessageEvent).data);
      fxHandlers.forEach((h) => h(fx));
    });
    return () => es.close();
  }, [uid]);
  return state;
}

/** Re-render on an interval — used by countdowns and timed reveal sequences. */
export function useNow(intervalMs = 200) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
