import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";

export class PublicError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export interface RoomRecord {
  expiresAt: number;
  host: string;
  members: Record<string, { uid: string; authToken: string; seenAt: number; lastAction: Record<string, number> }>;
  game: any;
  messages: string[];
  effects: { id: number; at: number; event: Record<string, unknown> }[];
  sequence: number;
}
export interface Store {
  transaction<T>(key: string, work: (room: RoomRecord | null) => Promise<{ room: RoomRecord; value: T }>): Promise<T>;
  rate(key: string, limit: number, seconds: number): Promise<void>;
}
const TTL = 24 * 60 * 60;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Distributed, fenced writes: an expired worker can never overwrite a newer room. */
export class RedisStore implements Store {
  constructor(private url: string, private token: string) {}
  private async command(...args: (string | number)[]) {
    const response = await fetch(this.url, {
      method: "POST", signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const body = await response.json();
    if (!response.ok || body.error) throw new PublicError("Room storage is temporarily unavailable. Please retry.", 503);
    return body.result;
  }
  async rate(key: string, limit: number, seconds: number) {
    const n = await this.command("EVAL", "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, `da:rate:${key}`, seconds);
    if (n > limit) throw new PublicError("Too many requests. Please try again shortly.", 429);
  }
  async transaction<T>(key: string, work: (room: RoomRecord | null) => Promise<{ room: RoomRecord; value: T }>): Promise<T> {
    const dataKey = `da:room:${key}`, lockKey = `${dataKey}:lock`, owner = randomUUID();
    let acquired = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      acquired = await this.command("SET", lockKey, owner, "NX", "PX", 90000) === "OK";
      if (acquired) break;
      await wait(150);
    }
    if (!acquired) throw new PublicError("The judge is processing this room. Retrying shortly…", 409);
    try {
      const raw = await this.command("GET", dataKey);
      const result = await work(raw ? JSON.parse(raw) : null);
      const committed = await this.command("EVAL", "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end; redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]); redis.call('DEL',KEYS[1]); return 1", 2, lockKey, dataKey, owner, JSON.stringify(result.room), TTL);
      if (!committed) throw new PublicError("The request expired. Please retry.", 409);
      return result.value;
    } finally {
      await this.command("EVAL", "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0", 1, lockKey, owner).catch(() => {});
    }
  }
}

/** Development only. Atomic file replacement survives a local server restart. */
export class FileStore implements Store {
  private queues = new Map<string, Promise<unknown>>();
  private rates = new Map<string, { n: number; until: number }>();
  constructor(private directory = resolve(".data/rooms")) {}
  async rate(key: string, limit: number, seconds: number) {
    const now = Date.now();
    for (const [k, v] of this.rates) if (v.until < now) this.rates.delete(k);
    const v = this.rates.get(key) ?? { n: 0, until: now + seconds * 1000 };
    this.rates.set(key, v); v.n++;
    if (v.n > limit) throw new PublicError("Too many requests. Please try again shortly.", 429);
  }
  async transaction<T>(key: string, work: (room: RoomRecord | null) => Promise<{ room: RoomRecord; value: T }>): Promise<T> {
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(key)) throw new PublicError("Invalid room link");
    const run = (this.queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
      await mkdir(this.directory, { recursive: true });
      const path = resolve(this.directory, `${key}.json`);
      const raw = await readFile(path, "utf8").catch((e) => { if (e.code === "ENOENT") return null; throw e; });
      const result = await work(raw ? JSON.parse(raw) : null);
      const tmp = `${path}.${randomUUID()}.tmp`;
      try { await writeFile(tmp, JSON.stringify(result.room)); await rename(tmp, path); }
      finally { await unlink(tmp).catch(() => {}); }
      return result.value;
    });
    this.queues.set(key, run);
    try { return await run; } finally { if (this.queues.get(key) === run) this.queues.delete(key); }
  }
}
