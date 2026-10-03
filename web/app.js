import { ColonyScene } from "./colony.js";
import { CHAMBERS, chamberFor, roleOf } from "./colony-model.js";
import { DemoColony, demoWorkflows } from "./demo.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};

const STATUS_ACTIVE = new Set(["running", "queued", "review", "blocked"]);
const SETTINGS_KEY = "antfarm-colony-settings-v1";
const POLL_MS = 4_000;
const WORKFLOW_COPY = {
  "repository-survey": "A local, read-only map of the configured repository. No model or source edits.",
  "feature-dev": "Plan, implement, test, and review a feature through a connected team.",
  "bug-fix": "Triage symptoms, isolate the cause, and carry a focused fix to completion.",
  "security-audit": "Scan, prioritize, repair, and verify security findings as a chain.",
};
const EMPTY_STATE = {
  mode: "live", agents: [], tasks: [], events: [], trails: [],
  stats: { total: 0, running: 0, queued: 0, review: 0, done: 0, failed: 0, blocked: 0, cancelled: 0 },
  config: { openclawConfigured: false, runtimeAvailable: false, installedWorkflows: [], workspace: "" },
  workflows: [],
};

function readSettings() {
  const defaults = { theme: "moss", labels: true, trails: true, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches };
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (["moss", "midnight", "earth"].includes(stored.theme)) defaults.theme = stored.theme;
    for (const key of ["labels", "trails", "reducedMotion"]) if (typeof stored[key] === "boolean") defaults[key] = stored[key];
  } catch { /* Invalid preferences are ignored. */ }
  return defaults;
}

const app = {
  mode: new URLSearchParams(location.search).get("demo") === "1" ? "demo" : "live",
  data: structuredClone(EMPTY_STATE),
  connected: false,
  paused: false,
  requestGeneration: 0,
  pollToken: null,
  liveAbort: null,
  pollTimer: 0,
  selectedTab: "missions",
  selectedId: null,
  inspectorVersion: 0,
  settings: readSettings(),
  demo: new DemoColony(),
  signatures: {},
};

document.documentElement.dataset.theme = app.settings.theme;
const scene = new ColonyScene($("#colony-canvas"), $("#chamber-labels"), inspectSceneSelection);
scene.setSettings(app.settings);
const sceneLoading = $("#scene-loading");
const canvas = $("#colony-canvas");
canvas.addEventListener("assets-ready", () => { sceneLoading.hidden = true; });
canvas.addEventListener("assets-error", (event) => {
  sceneLoading.classList.add("is-error");
  sceneLoading.lastChild.textContent = `Scene assets unavailable${event.detail ? ` · ${event.detail}` : ""}`;
});
if (canvas.dataset.assets === "ready") sceneLoading.hidden = true;

function iconPath(path) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", path);
  svg.append(p);
  return svg;
}

function toast(message, type = "ok") {
  const item = el("div", `toast ${type === "error" ? "error" : ""}`, message);
  $("#toast-region").append(item);
  setTimeout(() => item.remove(), 4_600);
}

function relativeTime(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "just now";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1_000));
  if (seconds < 15) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function nice(value = "") {
  return String(value).replace(/[-_.]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortTitle(title = "") {
  const parts = title.split(" · ");
  return parts[0] || title;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function normalizeState(value) {
  const stats = { ...EMPTY_STATE.stats, ...(value?.stats || {}) };
  return {
    ...EMPTY_STATE,
    ...value,
    mode: value?.mode || "live",
    agents: Array.isArray(value?.agents) ? value.agents : [],
    tasks: Array.isArray(value?.tasks) ? value.tasks : [],
    events: Array.isArray(value?.events) ? value.events.slice(0, 100) : [],
    trails: Array.isArray(value?.trails) ? value.trails : [],
    workflows: Array.isArray(value?.workflows) ? value.workflows : [],
    config: { ...EMPTY_STATE.config, ...(value?.config || {}) },
    stats,
  };
}

async function refreshLive({ announceError = false } = {}) {
  if (app.pollToken || app.mode !== "live") return;
  const generation = app.requestGeneration;
  const token = Symbol("live-poll");
  const controller = new AbortController();
  app.pollToken = token;
  app.liveAbort = controller;
  clearTimeout(app.pollTimer);
  try {
    const focused = document.activeElement;
    const state = normalizeState(await request("/api/state", { signal: controller.signal }));
    if (app.mode !== "live" || generation !== app.requestGeneration) return;
    app.connected = true;
    app.data = state;
    render({ preserveFocus: focused });
  } catch (error) {
    if (error.name === "AbortError" || app.mode !== "live" || generation !== app.requestGeneration) return;
    app.connected = false;
    renderConnection(error.message);
    window.dispatchEvent(new CustomEvent('colony-state-change', {detail:{mode:app.mode,connected:false,error:error.message,state:app.data}}));
    if (announceError) toast(`Could not reach the live colony: ${error.message}`, "error");
  } finally {
    if (app.pollToken !== token) return;
    app.pollToken = null;
    app.liveAbort = null;
    if (app.mode === "live" && generation === app.requestGeneration) app.pollTimer = setTimeout(refreshLive, POLL_MS);
  }
}

function renderConnection(error = "") {
  const banner = $("#connection-banner");
  const dot = $("#scene-status-dot");
  if (app.mode === "demo") {
    banner.hidden = true;
    dot.className = "status-dot ok";
    $("#scene-status").textContent = "Sample colony active";
    return;
  }
  if (app.connected) {
    banner.hidden = true;
    dot.className = "status-dot ok";
    $("#scene-status").textContent = `${app.data.stats.running + app.data.stats.review} moving · ${app.data.stats.queued} waiting`;
  } else {
    banner.hidden = false;
    banner.replaceChildren();
    banner.append("Live colony disconnected. ", el("span", "", error || "The local dashboard did not respond."), " ");
    const retry = el("button", "", "Retry now");
    retry.type = "button";
    retry.addEventListener("click", () => refreshLive({ announceError: true }));
    banner.append(retry);
    dot.className = "status-dot error";
    $("#scene-status").textContent = "Live colony disconnected";
  }
}

async function setMode(mode) {
  if (!['live', 'demo'].includes(mode) || mode === app.mode) return;
  app.requestGeneration += 1;
  app.liveAbort?.abort();
  app.liveAbort = null;
  app.pollToken = null;
  app.mode = mode;
  clearTimeout(app.pollTimer);
  $$("[data-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.mode === mode));
  $("#demo-banner").hidden = mode !== "demo";
  const url = new URL(location.href);
  if (mode === "demo") url.searchParams.set("demo", "1"); else url.searchParams.delete("demo");
  history.replaceState({}, "", url);
  if (mode === "demo") {
    app.connected = true;
    app.data = normalizeState(app.demo.getState());
    render();
    toast("Demo colony loaded. Nothing here writes to live data.");
  } else {
    app.connected = false;
    app.data = structuredClone(EMPTY_STATE);
    render();
    await refreshLive({ announceError: true });
  }
}

function statusBadge(status) {
  return el("span", `status-badge ${status || "queued"}`, nice(status || "queued"));
}

function render({ preserveFocus } = {}) {
  window.dispatchEvent(new CustomEvent('colony-state-change', { detail: { mode: app.mode, connected: app.connected, state: app.data } }));
  renderConnection();
  $$("[data-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.mode === app.mode));
  $("#demo-banner").hidden = app.mode !== "demo";
  $("#scene-mode-label").textContent = app.mode === "demo" ? "DEMO COLONY" : "LIVE COLONY";
  const latestMark = app.data.events[0]?.ts || app.data.tasks[0]?.updated_at;
  $("#scene-updated").textContent = latestMark ? `Last mark ${relativeTime(latestMark)}` : "No trail marks yet";
  $("#active-count").textContent = String((app.data.stats.running || 0) + (app.data.stats.review || 0));
  $("#mission-count").textContent = String(app.data.tasks.length);
  $("#ant-count").textContent = String(app.data.agents.length);
  $("#event-count").textContent = String(app.data.events.length);
  $("#scene-empty").hidden = !(app.mode === "live" && app.connected && app.data.tasks.length === 0);
  scene.setState(app.data);
  scene.setSettings(app.settings);
  renderActivity();
  renderWorkflows();
  renderGrowth();
  syncMissionDialog();
  if (preserveFocus && preserveFocus.isConnected) preserveFocus.focus({ preventScroll: true });
}

function filteredTasks() {
  const filter = $("#status-filter").value;
  if (filter === "active") return app.data.tasks.filter((task) => STATUS_ACTIVE.has(task.status));
  if (filter === "done") return app.data.tasks.filter((task) => task.status === "done");
  if (filter === "failed") return app.data.tasks.filter((task) => ["failed", "cancelled"].includes(task.status));
  return app.data.tasks;
}

function renderActivity() {
  const panel = $("#activity-panel");
  const data = app.selectedTab === "missions" ? filteredTasks() : app.selectedTab === "ants" ? app.data.agents : app.data.events;
  const signature = JSON.stringify([app.mode, app.selectedTab, $("#status-filter").value, data.map((item) => [item.id, item.status, item.updated_at, item.last_seen, item.task_id, item.ts])]);
  if (signature === app.signatures.activity) return;
  app.signatures.activity = signature;
  panel.replaceChildren();
  $("#mission-filters").hidden = app.selectedTab !== "missions";
  if (!data.length) {
    const empty = el("div", "list-empty");
    empty.append(iconPath("M12 4v4m0 8v4M4 12h4m8 0h4M6.3 6.3l2.8 2.8m5.8 5.8 2.8 2.8m0-11.4-2.8 2.8m-5.8 5.8-2.8 2.8"), el("h3", "", app.selectedTab === "missions" ? "No missions on this trail" : app.selectedTab === "ants" ? "No ants have reported in" : "No trail marks yet"), el("p", "", app.mode === "demo" ? "Launch a sample workflow to watch the handoffs." : "Live activity will appear here as the engine records it."));
    panel.append(empty);
  } else if (app.selectedTab === "missions") data.forEach((task) => panel.append(taskItem(task)));
  else if (app.selectedTab === "ants") data.forEach((agent) => panel.append(agentItem(agent)));
  else data.slice().sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 80).forEach((event) => panel.append(eventItem(event)));
  const summary = app.selectedTab === "missions" ? `${data.length} ${data.length === 1 ? "mission" : "missions"}` : app.selectedTab === "ants" ? `${data.length} specialists` : `${data.length} recent marks`;
  $("#activity-summary").textContent = summary;
}

function taskItem(task) {
  const button = el("button", "activity-item");
  button.type = "button";
  button.dataset.taskId = task.id;
  const top = el("div", "activity-item-top");
  top.append(el("h3", "", shortTitle(task.title)), statusBadge(task.status));
  const desc = el("p", "", task.description || "No mission notes supplied.");
  const meta = el("div", "activity-item-meta");
  meta.append(el("span", "role-chip", `${nice(task.kind)} · ${relativeTime(task.updated_at)}`), el("span", "", task.run_id ? `#${String(task.run_id).slice(0, 7)}` : ""));
  button.append(top, desc, meta);
  button.addEventListener("click", () => inspectTask(task));
  return button;
}

function agentItem(agent) {
  const button = el("button", "activity-item ant-item");
  button.type = "button";
  const avatar = el("span", "avatar", String(agent.name || agent.id).slice(0, 1).toUpperCase());
  const copy = el("span");
  copy.append(el("h3", "", agent.name || nice(agent.id)), el("p", "", `${nice(agent.role)} · ${agent.source === "opencode" ? agent.tool || "OpenCode session" : agent.task_id ? "on a mission" : "in the nursery"}`));
  button.append(avatar, copy, statusBadge(agent.status));
  button.addEventListener("click", () => inspectAgent(agent));
  return button;
}

function eventItem(event) {
  const item = el("div", "activity-item event-item");
  const top = el("div", "activity-item-top");
  top.append(el("h3", "", nice(event.type)), el("time", "", relativeTime(event.ts)));
  item.append(top, el("p", "", event.message || "Colony activity recorded."));
  return item;
}

function availableWorkflows() {
  const fromApi = app.data.workflows.length ? app.data.workflows : demoWorkflows;
  const hasSurvey = fromApi.some((flow) => flow.id === "repository-survey");
  return hasSurvey ? fromApi : [demoWorkflows[0], ...fromApi];
}

function workflowDescription(workflow) {
  return WORKFLOW_COPY[workflow.id] || `${workflow.steps?.length || 0} specialists carry this mission from intake to result.`;
}

function renderWorkflows() {
  const workflows = availableWorkflows();
  const signature = JSON.stringify(workflows);
  if (signature === app.signatures.workflows) return;
  app.signatures.workflows = signature;
  const preview = $("#workflow-preview");
  const catalog = $("#workflow-catalog");
  preview.replaceChildren();
  catalog.replaceChildren();
  workflows.filter((flow) => flow.id !== "repository-survey").slice(0, 3).forEach((flow, index) => preview.append(workflowMini(flow, index)));
  workflows.forEach((flow) => catalog.append(workflowCard(flow)));
}

function workflowMini(flow, index) {
  const card = el("div", "workflow-mini");
  card.append(el("span", "mini-icon", String(index + 1).padStart(2, "0")), el("h3", "", flow.name || nice(flow.id)), el("p", "", `${flow.steps?.length || 0} specialists · ${flow.steps?.map((step) => nice(step.agent)).join(" → ")}`));
  const dots = el("div", "step-dots");
  (flow.steps || []).forEach((_, dotIndex) => { if (dotIndex) dots.append(el("b")); dots.append(el("i")); });
  card.append(dots);
  return card;
}

function workflowCard(flow) {
  const card = el("article", "workflow-card");
  const head = el("div", "workflow-card-head");
  const copy = el("div");
  copy.append(el("p", "eyebrow", flow.id === "repository-survey" ? "LOCAL UTILITY" : "OPENCLAW TEAM"), el("h2", "", flow.name || nice(flow.id)));
  const launch = el("button", "", "Launch →");
  launch.type = "button";
  launch.addEventListener("click", () => openMission(flow.id));
  head.append(copy, launch);
  const description = el("p", "", workflowDescription(flow));
  const chain = el("div", "step-chain");
  (flow.steps || []).forEach((step, index) => {
    const node = el("div", "step-node");
    node.append(el("b", "", `${index + 1}. ${nice(step.id)}`), el("small", "", nice(step.agent)));
    chain.append(node);
  });
  card.append(head, description, chain);
  return card;
}

function achievements() {
  const completed = app.data.tasks.filter((task) => task.status === "done");
  const completedRuns = new Set();
  const agentRuns = new Map();
  app.data.tasks.forEach((task) => {
    if (!task.run_id) return;
    const agents = agentRuns.get(task.run_id) || new Set();
    if (task.assigned_to) agents.add(task.assigned_to);
    agentRuns.set(task.run_id, agents);
  });
  for (const runId of agentRuns.keys()) {
    const runTasks = app.data.tasks.filter((task) => task.run_id === runId);
    if (runTasks.length && runTasks.every((task) => task.status === "done")) completedRuns.add(runId);
  }
  const handoffs = app.data.tasks.filter((task) => task.status === "done" && task.depends_on?.length).length;
  const multiworker = [...agentRuns.values()].filter((agents) => agents.size >= 3).length;
  return [
    { id: "first", glyph: "01", name: "First harvest", description: "Complete one task to grow a fungus garden and acorn granary.", value: completed.length, target: 1 },
    { id: "three", glyph: "03", name: "Steady trail", description: "Complete three tasks to add a brood cradle and leaf map.", value: completed.length, target: 3 },
    { id: "ten", glyph: "10", name: "Busy burrow", description: "Complete ten tasks to build a dew cistern and flower patch.", value: completed.length, target: 10 },
    { id: "twentyfive", glyph: "25", name: "Thriving colony", description: "Complete twenty-five tasks to unlock an amber archive and aphid visitor.", value: completed.length, target: 25 },
    { id: "team", glyph: "×3", name: "Many mandibles", description: "Run a mission with at least three specialists.", value: multiworker, target: 1 },
    { id: "handoff", glyph: "→", name: "Clean handoff", description: "Finish a task that depends on another task.", value: handoffs, target: 1 },
    { id: "run", glyph: "◇", name: "Mission keeper", description: "Complete every step in three missions.", value: completedRuns.size, target: 3 },
  ];
}

function renderGrowth() {
  const data = achievements();
  const signature = JSON.stringify([app.mode, data]);
  if (signature === app.signatures.growth) return;
  app.signatures.growth = signature;
  const preview = $("#growth-preview");
  const grid = $("#achievement-grid");
  preview.replaceChildren(); grid.replaceChildren();
  data.slice(0, 2).forEach((item) => {
    const row = el("div", "growth-row");
    const glyph = el("span", "achievement-glyph"); glyph.append(el("span", "", item.glyph));
    const copy = el("span", "growth-copy"); copy.append(el("b", "", item.name), el("small", "", `${Math.min(item.value, item.target)} / ${item.target} ${app.mode === "demo" ? "demo progress" : "completed"}`));
    const meter = el("span", "progress"); const fill = el("i"); fill.style.width = `${Math.min(100, item.value / item.target * 100)}%`; meter.append(fill);
    row.append(glyph, copy, el("span", "achievement-count", item.value >= item.target ? "UNLOCKED" : `${Math.round(item.value / item.target * 100)}%`), meter); preview.append(row);
  });
  data.forEach((item) => {
    const unlocked = item.value >= item.target;
    const card = el("article", `achievement-card ${unlocked ? "" : "locked"}`);
    const top = el("div", "achievement-card-top");
    const glyph = el("span", "achievement-glyph"); glyph.append(el("span", "", item.glyph));
    top.append(glyph, app.mode === "demo" ? el("span", "demo-stamp", "DEMO") : el("span", "achievement-count", unlocked ? "UNLOCKED" : "LOCKED"));
    const meter = el("span", "progress"); const fill = el("i"); fill.style.width = `${Math.min(100, item.value / item.target * 100)}%`; meter.append(fill);
    card.append(top, el("h2", "", item.name), el("p", "", item.description), meter, el("span", "achievement-count", `${Math.min(item.value, item.target)} / ${item.target}`));
    grid.append(card);
  });
}

function syncMissionDialog(selected) {
  const select = $("#mission-workflow");
  const previous = selected || select.value;
  const workflows = availableWorkflows();
  const signature = JSON.stringify(workflows.map((flow) => [flow.id, flow.name]));
  if (signature !== app.signatures.missionWorkflows) {
    app.signatures.missionWorkflows = signature;
    select.replaceChildren();
    workflows.forEach((flow) => { const option = el("option", "", flow.name || nice(flow.id)); option.value = flow.id; select.append(option); });
  }
  if (workflows.some((flow) => flow.id === previous)) select.value = previous;
  renderSelectedSteps();
}

function renderSelectedSteps() {
  const selected = availableWorkflows().find((flow) => flow.id === $("#mission-workflow").value);
  const steps = $("#selected-workflow-steps");
  steps.replaceChildren();
  (selected?.steps || []).forEach((step) => steps.append(el("span", "selected-step", nice(step.agent))));
  const isSurvey = selected?.id === "repository-survey";
  $("#mission-brief").maxLength = isSurvey ? 200 : 4000;
  $("#brief-limit").textContent = isSurvey ? "200" : "4,000";
  const liveDisabled = app.mode === "live" && !isSurvey && (!app.data.config.runtimeAvailable || !app.data.config.installedWorkflows.includes(selected?.id));
  const note = $("#mission-mode-note");
  if (app.mode === "demo") note.textContent = "Demo dispatch: this mission runs a browser-only sample and never writes to the live colony.";
  else if (isSurvey) note.textContent = `Local survey: reads ${app.data.config.workspace || "the configured directory"} and reports findings without editing source files.`;
  else if (liveDisabled) note.textContent = "OpenClaw is not connected or this workflow is not installed. Open Connections for setup guidance.";
  else note.textContent = "Live dispatch: this starts a real installed OpenClaw workflow on the local engine.";
  note.classList.toggle("error", liveDisabled);
  $("#launch-button").disabled = liveDisabled;
}

function openMission(workflowId) {
  syncMissionDialog(workflowId);
  $("#mission-error").hidden = true;
  $("#mission-dialog").showModal();
  requestAnimationFrame(() => $("#mission-brief").focus());
}

async function submitMission(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") { $("#mission-dialog").close(); return; }
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const workflowId = $("#mission-workflow").value;
  const task = $("#mission-brief").value.trim();
  const button = $("#launch-button");
  const errorBox = $("#mission-error");
  button.disabled = true; button.textContent = "Dispatching…"; errorBox.hidden = true;
  try {
    let run;
    if (app.mode === "demo") run = await app.demo.launch(workflowId, task);
    else if (workflowId === "repository-survey") run = await request("/api/survey", { method: "POST", body: JSON.stringify({ title: task }) });
    else run = await request("/api/runs", { method: "POST", body: JSON.stringify({ workflowId, task }) });
    $("#mission-dialog").close();
    $("#mission-brief").value = ""; $("#brief-count").textContent = "0";
    const runId = run?.id || run?.run?.id;
    toast(`Mission dispatched${runId ? ` · ${String(runId).slice(0, 8)}` : ""}`);
    if (app.mode === "demo") { app.data = normalizeState(app.demo.getState()); render(); }
    else await refreshLive({ announceError: true });
  } catch (error) {
    errorBox.textContent = error.message; errorBox.hidden = false;
  } finally {
    button.textContent = "Dispatch mission →"; renderSelectedSteps();
  }
}

function detailCell(label, value) {
  const cell = el("div", "detail-cell"); cell.append(el("span", "", label), el("b", "", value || "—")); return cell;
}

function detailSection(label, text, isError = false) {
  const section = el("section", "detail-section"); section.append(el("h3", "", label));
  const content = el("pre", isError ? "error-text" : "", text || "No details recorded."); section.append(content); return section;
}

function setInspector(title, eyebrow = "MISSION DETAILS") {
  app.inspectorVersion += 1;
  app.selectedId = null;
  $("#inspector-title").textContent = title;
  $("#inspector-eyebrow").textContent = eyebrow;
  $("#inspector-body").replaceChildren();
  const actions = $("#inspector-actions"); actions.replaceChildren();
  const close = el("button", "button button-ghost", "Close"); close.type = "button"; close.addEventListener("click", () => $("#inspector-dialog").close()); actions.append(close);
}

async function inspectTask(task) {
  setInspector(shortTitle(task.title));
  app.selectedId = task.id;
  const version = app.inspectorVersion;
  const body = $("#inspector-body");
  const grid = el("div", "detail-grid");
  grid.append(detailCell("Status", nice(task.status)), detailCell("Specialist", nice(task.assigned_to || task.kind)), detailCell("Updated", relativeTime(task.updated_at)), detailCell("Run", task.run_id ? String(task.run_id).slice(0, 12) : "—"));
  body.append(grid, detailSection("Mission brief", task.description));
  if (task.depends_on?.length) {
    const section = el("section", "detail-section"); section.append(el("h3", "", "Depends on")); const list = el("div", "dependency-list"); task.depends_on.forEach((id) => list.append(el("span", "", String(id)))); section.append(list); body.append(section);
  }
  if (task.result) body.append(detailSection(app.mode === "demo" ? "Sample result" : "Result", task.result));
  if (task.error) body.append(detailSection("Error", task.error, true));
  addRunActions(task);
  const dialog = $("#inspector-dialog"); if (!dialog.open) dialog.showModal();
  if (app.mode === "live" && task.run_id) {
    try {
      const raw = await request(`/api/runs/${encodeURIComponent(task.run_id)}`);
      if (app.inspectorVersion !== version || !dialog.open) return;
      renderTimeline(raw, body);
    } catch (error) {
      if (app.inspectorVersion !== version || !dialog.open) return;
      const note = el("p", "form-error", `Run timeline unavailable: ${error.message}`); note.hidden = false; body.append(note);
    }
  } else {
    const related = app.data.tasks.filter((item) => item.run_id === task.run_id);
    renderTimeline({ id: task.run_id, status: task.status, steps: related }, body);
  }
}

function renderTimeline(run, body) {
  const section = el("section", "detail-section"); section.append(el("h3", "", "Run timeline"));
  const timeline = el("div", "timeline");
  (run.steps || []).forEach((step) => {
    const status = step.status || "queued";
    const row = el("div", `timeline-row ${status}`);
    row.append(el("b", "", nice(step.step_id || step.id || "step")), el("small", "", nice(status)));
    timeline.append(row);
  });
  section.append(timeline); body.append(section);
  const details = el("details", "raw-details"); details.append(el("summary", "", "Raw run record"), el("pre", "", JSON.stringify(run, null, 2))); body.append(details);
}

function addRunActions(task) {
  const actions = $("#inspector-actions");
  const runTasks = app.data.tasks.filter((item) => item.run_id === task.run_id);
  const hasActive = runTasks.some((item) => ["running", "queued", "review", "blocked"].includes(item.status));
  const hasFailed = runTasks.some((item) => item.status === "failed");
  if (app.mode === "live" && task.run_id && hasFailed && task.kind !== "survey") {
    const resume = el("button", "button button-primary", "Resume run"); resume.type = "button";
    resume.addEventListener("click", () => mutateRun(task.run_id, "resume", resume)); actions.prepend(resume);
  } else if (task.run_id && hasActive && !hasFailed) {
    const cancel = el("button", "button button-ghost", "Cancel mission"); cancel.type = "button";
    cancel.addEventListener("click", () => mutateRun(task.run_id, "cancel", cancel)); actions.prepend(cancel);
  }
}

async function mutateRun(runId, action, button) {
  if (action === "cancel" && !confirm("Cancel this mission? Work already completed will remain in its run history.")) return;
  button.disabled = true;
  try {
    if (app.mode === "demo") app.demo.cancel(runId);
    else await request(`/api/runs/${encodeURIComponent(runId)}/${action}`, { method: "POST", body: "{}" });
    $("#inspector-dialog").close(); toast(action === "cancel" ? "Mission cancelled" : "Mission resumed");
    if (app.mode === "demo") { app.data = normalizeState(app.demo.getState()); render(); } else await refreshLive({ announceError: true });
  } catch (error) { toast(error.message, "error"); button.disabled = false; }
}

function inspectAgent(agent) {
  setInspector(agent.name || nice(agent.id), "SPECIALIST");
  const body = $("#inspector-body"); const grid = el("div", "detail-grid");
  grid.append(detailCell("Role", nice(roleOf(agent))), detailCell("Status", nice(agent.status)), detailCell("Last seen", relativeTime(agent.last_seen)), detailCell("Agent ID", agent.id)); body.append(grid);
  if (agent.source === "opencode") body.append(detailSection("OpenCode observation", `Current tool: ${agent.tool || "none"}. This ant reflects an external session; control it in OpenCode. Telemetry does not create workflow results.`));
  const task = app.data.tasks.find((item) => item.id === agent.task_id);
  if (task) { body.append(detailSection("Current mission", `${task.title}\n\n${task.description || ""}`)); const open = el("button", "button button-primary", "Inspect mission"); open.type = "button"; open.addEventListener("click", () => inspectTask(task)); $("#inspector-actions").prepend(open); }
  const dialog = $("#inspector-dialog"); if (!dialog.open) dialog.showModal();
}

function inspectSceneSelection(selection) {
  if (!selection) return;
  if (selection.type === "agent") {
    const agent = app.data.agents.find((item) => item.id === selection.id); if (agent) inspectAgent(agent);
  } else {
    const chamber = CHAMBERS.find((item) => item.id === selection.id);
    if (!chamber) return;
    const agents = app.data.agents.filter((agent) => chamberFor(agent) === chamber.id);
    setInspector(chamber.name, "CHAMBER");
    const body = $("#inspector-body");
    body.append(detailSection(chamber.subtitle, agents.length ? `${agents.length} specialist${agents.length === 1 ? "" : "s"} currently ${chamber.id === "granary" ? "resting with completed work" : chamber.id === "nursery" ? "ready for a handoff" : "assigned here"}.` : "No specialist is currently assigned to this chamber."));
    agents.forEach((agent) => body.append(agentItem(agent))); const dialog = $("#inspector-dialog"); if (!dialog.open) dialog.showModal();
  }
}

function setView(view) {
  $$("[data-page]").forEach((section) => { section.hidden = section.dataset.page !== view; section.classList.toggle("is-active", section.dataset.page === view); });
  $$(".rail-link[data-view]").forEach((button) => { const active = button.dataset.view === view; button.classList.toggle("is-active", active); if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current"); });
  location.hash = view === "colony" ? "colony" : view;
  window.scrollTo({ top: 0, behavior: app.settings.reducedMotion ? "auto" : "smooth" });
}

function saveSettings(event) {
  event.preventDefault();
  if (event.submitter?.value !== "save") { $("#settings-dialog").close(); return; }
  app.settings = { theme: $("#theme-setting").value, labels: $("#labels-setting").checked, trails: $("#trails-setting").checked, reducedMotion: $("#motion-setting").checked };
  const persisted = persistSettings();
  document.documentElement.dataset.theme = app.settings.theme;
  $("#labels-toggle").checked = app.settings.labels; $("#trails-toggle").checked = app.settings.trails;
  scene.setSettings(app.settings); $("#settings-dialog").close(); toast(persisted ? "View settings saved" : "View applied for this session; browser storage is unavailable");
}

function persistSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(app.settings)); return true; }
  catch { return false; }
}

function openSettings() {
  $("#theme-setting").value = app.settings.theme; $("#labels-setting").checked = app.settings.labels; $("#trails-setting").checked = app.settings.trails; $("#motion-setting").checked = app.settings.reducedMotion;
  $("#settings-dialog").showModal();
}

function setPaused(paused) {
  app.paused = paused; scene.setPaused(paused);
  const button = $("#pause-button"); button.setAttribute("aria-pressed", String(paused)); $(".sr-only", button).textContent = paused ? "Resume animation" : "Pause animation";
}

function setZoom(value) { scene.setZoom(value); $("#zoom-level").textContent = `${Math.round(scene.getZoom() * 100)}%`; }

function exportSnapshot() {
  const snapshot = { exported_at: new Date().toISOString(), source: app.mode, state: app.data };
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `antfarm-${app.mode}-snapshot-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); toast("Snapshot downloaded");
}

function wireEvents() {
  $("#inspector-dialog").addEventListener("close", () => { app.inspectorVersion += 1; app.selectedId = null; });
  $$('[data-mode]').forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  $$('[data-open-mission]').forEach((button) => button.addEventListener("click", () => openMission()));
  $$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  $$('.rail-link[data-view]').forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $$('[data-view-target]').forEach((button) => button.addEventListener("click", () => setView(button.dataset.viewTarget)));
  $("#connections-button").addEventListener("click", () => $("#guide-dialog").showModal());
  $("#settings-button").addEventListener("click", openSettings);
  $("#mission-workflow").addEventListener("change", renderSelectedSteps);
  $("#mission-form").addEventListener("submit", submitMission);
  $("#settings-form").addEventListener("submit", saveSettings);
  $("#mission-brief").addEventListener("input", (event) => { $("#brief-count").textContent = String(event.target.value.length); });
  $$('.tabs [role="tab"]').forEach((tab, index, tabs) => {
    tab.id = `${tab.dataset.tab}-tab`;
    tab.tabIndex = index === 0 ? 0 : -1;
    tab.addEventListener("click", () => {
      app.selectedTab = tab.dataset.tab;
      tabs.forEach((item) => { item.setAttribute("aria-selected", String(item === tab)); item.tabIndex = item === tab ? 0 : -1; });
      $("#activity-panel").setAttribute("aria-labelledby", tab.id); renderActivity();
    });
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus(); tabs[next].click();
    });
  });
  $("#status-filter").addEventListener("change", () => { app.signatures.activity = ""; renderActivity(); });
  $("#refresh-button").addEventListener("click", () => app.mode === "live" ? refreshLive({ announceError: true }) : toast("Demo state is already current"));
  $("#empty-survey").addEventListener("click", () => openMission("repository-survey"));
  $("#pause-button").addEventListener("click", () => setPaused(!app.paused));
  $("#labels-toggle").addEventListener("change", (event) => { app.settings.labels = event.target.checked; persistSettings(); scene.setSettings(app.settings); });
  $("#trails-toggle").addEventListener("change", (event) => { app.settings.trails = event.target.checked; persistSettings(); scene.setSettings(app.settings); });
  $("#zoom-out").addEventListener("click", () => setZoom(scene.getZoom() - .1));
  $("#zoom-in").addEventListener("click", () => setZoom(scene.getZoom() + .1));
  $("#zoom-reset").addEventListener("click", () => setZoom(1));
  $("#snapshot-button").addEventListener("click", exportSnapshot);
  window.addEventListener("demo-state-change", () => { if (app.mode === "demo") { app.data = normalizeState(app.demo.getState()); render(); } });
  window.addEventListener("beforeunload", () => { clearTimeout(app.pollTimer); app.demo.destroy(); scene.destroy(); });
  document.addEventListener("keydown", (event) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) || event.target.isContentEditable;
    if (typing || event.metaKey || event.ctrlKey || event.altKey || $('dialog[open]')) return;
    if (event.key.toLowerCase() === "n") { event.preventDefault(); openMission(); }
    if (event.code === "Space" && !event.target.closest('button,a,[role="button"]')) { event.preventDefault(); setPaused(!app.paused); }
  });
  $$('dialog').forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
}

wireEvents();
$("#labels-toggle").checked = app.settings.labels;
$("#trails-toggle").checked = app.settings.trails;
setZoom(1);
const initialView = ["workflows", "growth"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "colony";
setView(initialView);
if (app.mode === "demo") { app.data = normalizeState(app.demo.getState()); render(); } else { render(); refreshLive(); }
