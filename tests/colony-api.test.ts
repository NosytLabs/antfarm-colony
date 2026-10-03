import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const temporary = mkdtempSync(path.join(tmpdir(), "antfarm-colony-api-"));
const workspace = path.join(temporary, "workspace");
process.env.ANTFARM_HOME = path.join(temporary, "state");
process.env.OPENCLAW_STATE_DIR = path.join(temporary, "openclaw");
mkdirSync(workspace, { recursive: true });
writeFileSync(path.join(workspace, "README.md"), "# Survey fixture\n");
writeFileSync(path.join(workspace, "app.ts"), "// TODO: cover this branch\nexport const value = 1;\n");
writeFileSync(path.join(workspace, ".env"), "SECRET=must-not-be-read\n");
mkdirSync(path.join(workspace, "node_modules"));
writeFileSync(path.join(workspace, "node_modules", "ignored.js"), "FIXME ignored\n");
symlinkSync(path.join(workspace, "app.ts"), path.join(workspace, "linked.ts"));

const { createDashboardServer } = await import("../dist/server/dashboard.js");
const server = createDashboardServer({ workspace, host: "127.0.0.1" });
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("test server did not bind TCP");
const base = `http://127.0.0.1:${address.port}`;

function requestWithHost(pathname, host) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: address.port, path: pathname, headers: { Host: host } }, (res) => {
      res.resume();
      res.once("end", () => resolve(res.statusCode));
    });
    req.once("error", reject);
    req.end();
  });
}

test.after(() => {
  server.close();
  rmSync(temporary, { recursive: true, force: true });
});

test("health, static UI, and empty live state are served", async () => {
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual((await health.json()).status, "ok");

  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /^text\/html/);

  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.mode, "live");
  assert.equal(state.config.workspace, path.resolve(workspace));
  assert.equal(state.config.openclawConfigured, false);
  assert.deepEqual(state.agents, []);
  assert.deepEqual(state.tasks, []);
});

test("repository survey persists three real sequential reports", async () => {
  const created = await fetch(`${base}/api/survey`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ title: "Fixture audit" }),
  });
  assert.equal(created.status, 202);
  const payload = await created.json();
  assert.equal(payload.tasks.length, 3);

  let run;
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    run = await (await fetch(`${base}/api/runs/${payload.run.id}`)).json();
    if (run.status !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(run.status, "completed");
  assert.deepEqual(run.steps.map((step) => step.status), ["done", "done", "done"]);
  const inventory = JSON.parse(run.steps[0].output);
  assert.equal(inventory.files, 2);
  assert.equal(inventory.skipped.symlinks, 1);
  assert.equal(inventory.skipped.sensitivePaths, 1);
  const summary = JSON.parse(run.steps[2].output);
  assert.ok(summary.findings.signals.some((signal) => signal.rule === "unfinished-work-marker" && signal.file === "app.ts"));

  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.stats.done, 3);
  assert.equal(state.tasks.filter((task) => task.run_id === payload.run.id).length, 3);
  assert.ok(state.events.some((event) => event.type === "run.completed"));
});

test("mutations reject cross-origin, malformed bodies, wrong methods, and unavailable runtime", async () => {
  assert.equal(await requestWithHost("/api/state", "attacker.invalid"), 403);

  const crossOrigin = await fetch(`${base}/api/survey`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://attacker.invalid" },
    body: "{}",
  });
  assert.equal(crossOrigin.status, 403);

  const malformed = await fetch(`${base}/api/survey`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: "{",
  });
  assert.equal(malformed.status, 400);

  const wrongMethod = await fetch(`${base}/api/health`, { method: "POST", headers: { Origin: base } });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "GET");

  const unavailable = await fetch(`${base}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ workflowId: "feature-dev", task: "Do real work" }),
  });
  assert.equal(unavailable.status, 503);
  assert.match((await unavailable.json()).error, /OpenClaw runtime is not configured/);
});
