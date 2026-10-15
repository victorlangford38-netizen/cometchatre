import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createService } from "../server/service";
import { FileStore } from "../server/store";
import { createLlm } from "../server/llm";
import type { CometChatRest } from "../server/cometchat";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "arena-test-"));
  const store = new FileStore(dir);
  const messages = new Map<string, any>();
  let groups = 0, tokenCount = 0;
  const cc = { upsertUser: async () => ({}), createToken: async () => ({ authToken: `test-only-${++tokenCount}` }),
    createGroup: async () => { groups++; return {}; }, deleteGroup: async () => ({}),
    sendText: async () => ({ id: "1" }), getMessage: async (id: string) => messages.get(id) } as CometChatRest;
  const llm = createLlm({ provider: "none", apiKey: "", model: "", baseUrl: "" });
  const service = () => createService({}, { store, cc, llm });
  const room = randomUUID().replaceAll("-", "");
  const host = "h".repeat(64), guest = "g".repeat(64), outsider = "o".repeat(64);
  const request = (route: string, token = host, body = {}) => service().request(route, { room, ...body }, token, "test");
  const edit = async (fn: (record: any) => void) => { const path = join(dir, room + ".json"); const r = JSON.parse(await readFile(path, "utf8")); fn(r); await writeFile(path, JSON.stringify(r)); };
  return { request, edit, service, room, host, guest, outsider, messages, groups: () => groups, tokens: () => tokenCount };
}

test("guest identity is private, room-scoped, idempotent, and survives a new service instance", async () => {
  const f = await fixture();
  const a = await f.request("create", f.host, { name: "Alex" });
  const b = await f.request("join", f.guest, { name: "Sam", uid: a.uid });
  assert.notEqual(a.uid, b.uid);
  assert.notEqual(a.authToken, b.authToken);
  assert.deepEqual(await f.request("join", f.host, { name: "Alex" }), a);
  assert.equal(f.tokens(), 2);
  const snapshot = await f.request("state");
  assert.equal(snapshot.state.me.uid, a.uid);
  assert.equal(snapshot.state.hostUid, a.uid);
  assert.equal(snapshot.state.players.length, 2);
  assert.ok(!JSON.stringify(snapshot).includes("test-only"));
  const config = await f.request("config");
  assert.ok(!("authKey" in config));
  await assert.rejects(f.request("start", f.guest), /Only the room host/);
  await assert.rejects(f.request("reset", f.outsider, { uid: a.uid }), /Join this arena/);
  await assert.rejects(f.request("role", f.guest, { role: "pro" }), /podium is taken/);
  const second = await f.service().request("create", { room: "second-room-123456", name: "Other" }, f.host, "second");
  assert.notEqual(second.uid, a.uid);
  assert.equal((await f.request("state")).state.players.length, 2);
});

test("simultaneous joins cannot duplicate podiums or overwrite members", async () => {
  const f = await fixture(); await f.request("create", f.host, { name: "Alex" });
  await Promise.all(Array.from({ length: 9 }, (_, i) => f.request("join", String(i).repeat(64), { name: `Guest ${i}` })));
  const { state } = await f.request("state");
  assert.equal(state.players.length, 10);
  assert.equal(state.players.filter((p: any) => p.role === "pro").length, 1);
  assert.equal(state.players.filter((p: any) => p.role === "con").length, 1);
  await assert.rejects(f.request("join", f.outsider, { name: "Overflow" }), /Room is full/);
});

test("cold requests advance rounds, reject forged messages, deduplicate scores, finish and rematch", async () => {
  const f = await fixture(); const a = await f.request("create", f.host, { name: "Alex" });
  await f.request("join", f.guest, { name: "Sam" });
  await f.request("start");
  assert.equal(f.groups(), 1);
  await f.edit(r => { r.game.phaseEndsAt = Date.now() - 4700; });
  const { state } = await f.request("state");
  assert.equal(state.phase, "round");
  f.messages.set("100", { sender: a.uid, receiver: state.groupGuid, receiverType: "group", category: "message", type: "text", sentAt: Date.now() / 1000, data: { text: "Because a 4-day week reduces overhead, a measured trial makes sense." } });
  await assert.rejects(f.request("message", f.guest, { id: "100", uid: a.uid }), /does not belong/);
  await f.request("message", f.host, { id: "100", text: "fabricated override" });
  const scored = (await f.request("state")).state.scores;
  await f.edit(r => { Object.values<any>(r.members).forEach(m => m.lastAction = {}); });
  await f.request("message", f.host, { id: "100" });
  assert.deepEqual((await f.request("state")).state.scores, scored);
  await f.edit(r => { assert.equal(r.game.transcript.length, 1); assert.ok(!r.game.transcript[0].text.includes("fabricated")); r.game.phaseEndsAt = Date.now() - 300000; });
  const verdict = (await f.request("state")).state;
  assert.equal(verdict.phase, "verdict"); assert.ok(verdict.verdict.summary);
  await assert.rejects(f.request("rematch", f.guest), /Only the room host/);
  await f.request("rematch");
  const rematch = (await f.request("state")).state;
  assert.equal(rematch.phase, "spin"); assert.equal(rematch.me.role, "con"); assert.equal(f.groups(), 2);
});

test("expiry, unknown rooms, invalid tokens and absent-host recovery", async () => {
  const f = await fixture();
  await assert.rejects(f.request("state"), /does not exist/);
  await f.request("create", f.host, { name: "Alex" });
  const guest = await f.request("join", f.guest, { name: "Sam" });
  await assert.rejects(f.request("state", "invalid"), /guest session/);
  await f.edit(r => { r.members[r.host].seenAt = Date.now() - 100000; });
  assert.equal((await f.request("state", f.guest)).state.hostUid, guest.uid);
  await f.edit(r => { r.expiresAt = Date.now() - 1; });
  await assert.rejects(f.request("state"), /expired/);
});

test("Vercel refuses ephemeral storage when persistent Redis is not configured", async () => {
  const service = createService({ VERCEL: "1", COMETCHAT_APP_ID: "test", COMETCHAT_REST_API_KEY: "test" });
  const cfg = await service.request("config", {}, "", "");
  assert.ok(cfg.missing.some((m: string) => m.includes("REDIS")));
  await assert.rejects(service.request("create", { room: "some-room-12345678", name: "Alex" }, "h".repeat(64), ""), /not configured/);
});

test("a delayed message from the preceding round is scored, but post-debate text is rejected", async () => {
  const f = await fixture(); const a = await f.request("create", f.host, { name: "Alex" });
  await f.request("join", f.guest, { name: "Sam" }); await f.request("start");
  await f.edit(r => { r.game.phase = "round"; r.game.roundIndex = 1; r.game.phaseStartedAt = Date.now() - 1000; r.game.phaseEndsAt = Date.now() + 89000; });
  const { state } = await f.request("state");
  f.messages.set("200", { sender: a.uid, receiver: state.groupGuid, receiverType: "group", category: "message", type: "text", sentAt: (Date.now() - 3000) / 1000, data: { text: "Because this is a real preceding-round message, it should still count." } });
  await f.request("message", f.host, { id: "200" });
  await f.edit(r => { assert.equal(r.game.transcript.length, 1); r.game.phase = "deliberating"; r.game.phaseStartedAt = Date.now() - 5000; r.game.phaseEndsAt = Date.now() + 5000; Object.values<any>(r.members).forEach(m => m.lastAction = {}); });
  f.messages.set("201", { ...f.messages.get("200"), sentAt: Date.now() / 1000 });
  await assert.rejects(f.request("message", f.host, { id: "201" }), /outside the active round/);
});

test("leaving the lobby frees the seat and transfers hosting to the remaining guest", async () => {
  const f = await fixture(); await f.request("create", f.host, { name: "Alex" });
  const b = await f.request("join", f.guest, { name: "Sam" });
  await f.request("leave");
  const { state } = await f.request("state", f.guest);
  assert.equal(state.players.length, 1); assert.equal(state.hostUid, b.uid);
  await assert.rejects(f.request("start"), /Join this arena/);
  const c = await f.request("join", f.outsider, { name: "Replacement" });
  assert.equal((await f.request("state", f.outsider)).state.me.role, "pro");
  assert.notEqual(c.uid, b.uid);
});
