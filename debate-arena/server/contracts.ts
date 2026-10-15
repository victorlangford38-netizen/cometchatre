import type { CometChatRest } from "./cometchat.js";
import type { Llm } from "./llm.js";
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
  saved?: any;
}

export interface GameModule {
  routes: Record<string, (body: any) => unknown | Promise<unknown>>;
  viewFor(uid: string | null): unknown;
  snapshot(): any;
  tick(): Promise<void>;
  flush(): Promise<void>;
}

export type CreateGame = (ctx: GameContext) => GameModule;

