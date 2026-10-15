import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { RedisStore, type RoomRecord } from "../server/store";

const url = process.env.TEST_REDIS_REST_URL;
const token = process.env.TEST_REDIS_REST_TOKEN;
test("real Redis: independent workers, concurrency, fenced commits, rate limits and TTL", { skip: !url || !token }, async () => {
  const id = randomUUID().replaceAll("-", "");
  const key = `da:room:${id}`;
  const command = async (...args: unknown[]) => {
    const response = await fetch(url!, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
    const body = await response.json();
    assert.equal(response.status, 200); assert.ok(!body.error); return body.result;
  };
  const record: RoomRecord = { expiresAt: Date.now() + 86400000, host: "fixture", members: {}, game: { count: 0 }, messages: [], effects: [], sequence: 0 };
  const worker = () => new RedisStore(url!, token!);
  try {
    await worker().transaction(id, async () => ({ room: record, value: true }));
    await Promise.all(Array.from({ length: 4 }, () => worker().transaction(id, async room => {
      assert.ok(room); room.game.count++; return { room, value: true };
    })));
    const persisted = JSON.parse(await command("GET", key));
    assert.equal(persisted.game.count, 4);
    assert.ok(await command("TTL", key) > 86000);
    await assert.rejects(worker().transaction(id, async room => {
      assert.ok(room); room.game.count = 999;
      // Simulate another worker acquiring the lease after this worker expired.
      await command("SET", `${key}:lock`, "new-owner", "PX", 5000);
      return { room, value: true };
    }), /expired/);
    assert.equal(JSON.parse(await command("GET", key)).game.count, 4);
    assert.equal(await command("GET", `${key}:lock`), "new-owner");
    await worker().rate(id, 2, 60); await worker().rate(id, 2, 60);
    await assert.rejects(worker().rate(id, 2, 60), /Too many/);
  } finally {
    // Remove only this run's random fixture keys.
    await command("DEL", key, `${key}:lock`, `da:rate:${id}`);
  }
});
