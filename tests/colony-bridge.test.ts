import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const temporary = mkdtempSync(path.join(tmpdir(), "antfarm-colony-bridge-"));
const workspace = path.join(temporary, "workspace");
process.env.ANTFARM_HOME = path.join(temporary, "state");
process.env.OPENCLAW_STATE_DIR = path.join(temporary, "openclaw");
mkdirSync(workspace, { recursive: true });

const { createDashboardServer } = await import("../dist/server/dashboard.js");
const { getDb } = await import("../dist/db.js");
const server = createDashboardServer({ workspace, host: "127.0.0.1" });
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("bridge test server did not bind TCP");
const base = `http://127.0.0.1:${address.port}`;

async function postEvent(payload) {
  return fetch(`${base}/api/bridge/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify(payload),
  });
}

test.after(() => {
  server.close();
  rmSync(temporary, { recursive: true, force: true });
});

test("OpenCode telemetry is validated, idempotent, and separate from workflow tasks", async () => {
  const first = await postEvent({
    source: "opencode",
    sessionId: "session-1",
    eventId: "event-1",
    status: "running",
    role: "builder",
    name: "Cedar",
    tool: "edit",
  });
  assert.equal(first.status, 202);
  const accepted = await first.json();
  assert.equal(accepted.accepted, true);
  assert.deepEqual(Object.keys(accepted.event).sort(), ["eventId", "lastSeen", "name", "role", "sessionId", "source", "status", "tool"]);

  const update = await postEvent({
    source: "opencode",
    sessionId: "session-1",
    eventId: "event-1",
    status: "blocked",
    role: "verifier",
    name: "Cedar",
    tool: "test",
  });
  assert.equal(update.status, 202);
  const count = getDb().prepare("SELECT COUNT(*) AS count FROM bridge_events WHERE event_id = 'event-1'").get();
  assert.equal(count.count, 1);

  const state = await (await fetch(`${base}/api/state`)).json();
  const agent = state.agents.find((candidate) => candidate.id === "opencode:session-1");
  assert.deepEqual(agent, {
    id: "opencode:session-1",
    name: "Cedar",
    role: "verifier",
    status: "blocked",
    task_id: null,
    last_seen: agent.last_seen,
    source: "opencode",
    tool: "test",
  });
  assert.equal(state.tasks.length, 0);
  assert.ok(state.events.some((event) => event.id === "opencode:event-1" && event.type === "bridge.blocked"));
});

test("bridge rejects unsupported sources, fields, and enum values without storing payload content", async () => {
  const badSource = await postEvent({ source: "other", sessionId: "s", eventId: "e", status: "running", role: "builder", name: "Bad" });
  assert.equal(badSource.status, 400);

  const prompt = await postEvent({ source: "opencode", sessionId: "s", eventId: "e", status: "running", role: "builder", name: "Bad", prompt: "private prompt" });
  assert.equal(prompt.status, 400);
  assert.match((await prompt.json()).error, /Unexpected field: prompt/);

  const badRole = await postEvent({ source: "opencode", sessionId: "s", eventId: "e", status: "running", role: "reviewer", name: "Bad" });
  assert.equal(badRole.status, 400);

  const columns = getDb().prepare("PRAGMA table_info(bridge_events)").all().map((column) => column.name);
  assert.equal(columns.includes("prompt"), false);
  assert.equal(columns.includes("source_code"), false);
});

test("bridge bounds retained telemetry and marks sessions idle after fifteen minutes", async () => {
  for (let index = 0; index < 105; index += 1) {
    const response = await postEvent({
      source: "opencode",
      sessionId: `bounded-${index}`,
      eventId: `bounded-event-${index}`,
      status: "running",
      role: "scout",
      name: `Scout ${index}`,
    });
    assert.equal(response.status, 202);
  }
  const db = getDb();
  assert.equal(db.prepare("SELECT COUNT(DISTINCT session_id) AS count FROM bridge_events").get().count, 100);
  assert.ok(db.prepare("SELECT COUNT(*) AS count FROM bridge_events").get().count <= 500);

  const stale = await postEvent({ source: "opencode", sessionId: "stale-session", eventId: "stale-event", status: "running", role: "planner", name: "Old Oak" });
  assert.equal(stale.status, 202);
  db.prepare("UPDATE bridge_events SET updated_at = ? WHERE event_id = ?").run(new Date(Date.now() - 16 * 60 * 1_000).toISOString(), "stale-event");
  const state = await (await fetch(`${base}/api/state`)).json();
  const agent = state.agents.find((candidate) => candidate.id === "opencode:stale-session");
  assert.equal(agent.status, "idle");
  assert.equal(agent.task_id, null);
});
