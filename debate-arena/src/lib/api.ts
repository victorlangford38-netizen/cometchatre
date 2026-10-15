import { useEffect, useRef, useState } from "react";

export interface AppConfig { appId: string; region: string; missing: string[]; llm: string }
export const roomId = () => new URL(location.href).searchParams.get("room");
export function guestToken() {
  const key = `arena-session:${roomId() ?? "new"}`;
  let token = sessionStorage.getItem(key);
  if (!token) { token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""); sessionStorage.setItem(key, token); }
  return token;
}
export function enterRoom(id: string, token: string) {
  sessionStorage.setItem(`arena-session:${id}`, token);
  const url = new URL(location.href); url.searchParams.set("room", id);
  history.replaceState(null, "", url);
  window.dispatchEvent(new Event("arena-room"));
}
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T = any>(route: string, body: Record<string, unknown> = {}, retry = 0): Promise<T> {
  const res = await fetch(`/api/${route}`, {
    method: "POST", signal: AbortSignal.timeout(65000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${guestToken()}` },
    body: JSON.stringify({ room: roomId(), ...body }),
  });
  const json = await res.json();
  if (!res.ok) {
    if ([409, 429].includes(res.status) && retry < 12 && route !== "state") {
      await new Promise(r => setTimeout(r, 1500)); return api(route, body, retry + 1);
    }
    throw new ApiError(json.error ?? "Request failed", res.status);
  }
  window.dispatchEvent(new Event(route === "state" ? "arena-polled" : "arena-refresh"));
  return json as T;
}
export async function getConfig(): Promise<AppConfig> {
  const response = await fetch("/api/config");
  if (!response.ok) throw new Error("The arena server could not be reached. Please reload.");
  return response.json();
}
export const reportError = (error: unknown) => window.dispatchEvent(new CustomEvent("arena-error", { detail: error instanceof Error ? error.message : "Something went wrong. Please retry." }));

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

/** Poll durable room state. CometChat still carries chat and calls in real time. */
export function useGameState<T extends { serverNow: number }>(uid: string | null) {
  const [state, setState] = useState<T | null>(null);
  useEffect(() => {
    let alive = true, busy = false, after = 0;
    const poll = async () => {
      if (busy || !alive) return;
      busy = true;
      try {
        const next = await api<{ state: T; effects: { id: number; event: any }[] }>("state", { after });
        if (!alive) return;
        clockOffset = next.state.serverNow - Date.now();
        setState(next.state);
        for (const fx of next.effects) { after = Math.max(after, fx.id); fxHandlers.forEach(h => h(fx.event)); }
        window.dispatchEvent(new CustomEvent("arena-connection", { detail: "" }));
      } catch (e) {
        if (alive) window.dispatchEvent(new CustomEvent("arena-connection", { detail: e instanceof ApiError && [404, 410].includes(e.status) ? e.message : "Reconnecting to the arena…" }));
      } finally { busy = false; }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1200);
    const refresh = () => void poll();
    window.addEventListener("arena-refresh", refresh); window.addEventListener("arena-room", refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("arena-refresh", refresh); window.removeEventListener("arena-room", refresh); };
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
