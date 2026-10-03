const panel = document.querySelector("#onboarding-panel");
const ACKNOWLEDGED_KEY = "antfarm-colony-onboarding-acknowledged-v1";
const WORKFLOW_KEY = "antfarm-colony-onboarding-workflow-v1";
const VALID_WORKFLOWS = new Set(["feature-dev", "bug-fix", "security-audit"]);

let latestState = null;
let connected = false;

const get = (selector) => document.querySelector(selector);

function readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeLocal(key, value) {
  try { localStorage.setItem(key, value); } catch { /* The guide remains usable without persistence. */ }
}

function liveModeSelected() {
  return new URLSearchParams(location.search).get("demo") !== "1";
}

function setDiagnostic(selector, text, state = "") {
  const node = get(selector);
  node.textContent = text;
  node.classList.toggle("is-ready", state === "ready");
  node.classList.toggle("is-missing", state === "missing");
}

function surveyState(tasks) {
  const runs = new Map();
  for (const task of tasks) {
    if (task.kind !== "survey") continue;
    const items = runs.get(task.run_id) || [];
    items.push(task);
    runs.set(task.run_id, items);
  }
  const completed = [...runs.values()].some((tasksInRun) => tasksInRun.length && tasksInRun.every((task) => task.status === "done"));
  const active = [...runs.values()].some((tasksInRun) => tasksInRun.some((task) => ["queued", "running", "review", "blocked"].includes(task.status)));
  return { completed, active };
}

function selectedWorkflow() {
  const value = get("#onboarding-workflow").value;
  return VALID_WORKFLOWS.has(value) ? value : "feature-dev";
}

function updateCommand() {
  const workflow = selectedWorkflow();
  get("#onboarding-command").textContent = `npm run cli -- workflow install ${workflow}`;
  writeLocal(WORKFLOW_KEY, workflow);
  renderDiagnostics();
}

function renderDiagnostics() {
  if (!connected) {
    for (const selector of ['#onboarding-workspace','#onboarding-openclaw','#onboarding-installed']) setDiagnostic(selector,'Unavailable','missing');
    for (const id of ['survey','connect','install']) get(`#onboarding-step-${id}`).classList.remove('is-complete');
    get('#onboarding-status').textContent='Local API unavailable. Start Colony with npm start, then refresh status.';
    return;
  }
  if (!latestState) return;
  const config = latestState.config || {};
  const installed = Array.isArray(config.installedWorkflows) ? config.installedWorkflows : [];
  const survey = surveyState(Array.isArray(latestState.tasks) ? latestState.tasks : []);
  const workflow = selectedWorkflow();
  const workflowInstalled = installed.includes(workflow);

  setDiagnostic("#onboarding-workspace", config.workspace || "Not reported", config.workspace ? "ready" : "missing");
  setDiagnostic("#onboarding-openclaw", config.openclawConfigured ? "Configuration found" : "Not configured", config.openclawConfigured ? "ready" : "missing");
  setDiagnostic("#onboarding-installed", installed.length ? installed.join(", ") : "None installed", installed.length ? "ready" : "missing");

  get("#onboarding-step-survey").classList.toggle("is-complete", survey.completed);
  get("#onboarding-step-connect").classList.toggle("is-complete", Boolean(config.openclawConfigured));
  get("#onboarding-step-install").classList.toggle("is-complete", workflowInstalled);
  get("#onboarding-survey").firstChild.textContent = survey.active ? "Survey in progress " : survey.completed ? "Run survey again " : "Start read-only survey ";
  get("#onboarding-dispatch").firstChild.textContent = workflowInstalled && config.openclawConfigured ? "Open mission brief " : "Preview mission brief ";

  const message = survey.active
    ? "The local survey is running. Diagnostics refresh automatically."
    : workflowInstalled && config.openclawConfigured
      ? `${workflow} is installed and OpenClaw configuration was detected.`
      : "Status comes from the live local API. No setup action runs automatically.";
  get("#onboarding-status").textContent = message;
}

function refreshDiagnostics({ announce = false } = {}) {
  if (panel.hidden || !liveModeSelected()) return;
  if (latestState) renderDiagnostics();
  if (announce) get("#onboarding-status").textContent = "Refreshing live diagnostics…";
  get("#refresh-button")?.click();
}

window.addEventListener("colony-state-change", ({detail}) => {
  if (detail.mode !== "live") { hidePanel(); return; }
  latestState = detail.state;
  connected = detail.connected;
  if (readLocal(ACKNOWLEDGED_KEY) !== "1") panel.hidden = false;
  if (!panel.hidden) renderDiagnostics();
});

function hidePanel({ acknowledge = false } = {}) {
  panel.hidden = true;
  if (acknowledge) writeLocal(ACKNOWLEDGED_KEY, "1");
}

function showPanel({ force = false } = {}) {
  if (!liveModeSelected()) return;
  if (!force && readLocal(ACKNOWLEDGED_KEY) === "1") return;
  panel.hidden = false;
  refreshDiagnostics();
}

get("#onboarding-dismiss").addEventListener("click", () => hidePanel({ acknowledge: true }));
get("#onboarding-refresh").addEventListener("click", () => refreshDiagnostics({ announce: true }));
get("#onboarding-workflow").addEventListener("change", updateCommand);
get("#onboarding-survey").addEventListener("click", () => get("#empty-survey")?.click());
get("#onboarding-connections").addEventListener("click", () => get("#connections-button")?.click());
get("#onboarding-demo").addEventListener("click", () => get('.mode-switch [data-mode="demo"]')?.click());
get("#onboarding-dispatch").addEventListener("click", () => {
  get("[data-open-mission]")?.click();
  const missionWorkflow = get("#mission-workflow");
  if (missionWorkflow && [...missionWorkflow.options].some((option) => option.value === selectedWorkflow())) {
    missionWorkflow.value = selectedWorkflow();
    missionWorkflow.dispatchEvent(new Event("change", { bubbles: true }));
  }
});
get("#onboarding-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(get("#onboarding-command").textContent);
    get("#onboarding-copy").textContent = "Copied";
    setTimeout(() => { get("#onboarding-copy").textContent = "Copy"; }, 1_600);
  } catch {
    get("#onboarding-status").textContent = "Copy was unavailable. Select the terminal command manually.";
  }
});
get("#open-onboarding").addEventListener("click", () => {
  get("#guide-dialog")?.close();
  get('[data-view="colony"]')?.click();
  showPanel({ force: true });
  requestAnimationFrame(() => panel.focus({ preventScroll: true }));
});

get('.mode-switch [data-mode="demo"]')?.addEventListener("click", () => hidePanel());
get('.mode-switch [data-mode="live"]')?.addEventListener("click", () => setTimeout(() => showPanel(), 0));

const rememberedWorkflow = readLocal(WORKFLOW_KEY);
if (VALID_WORKFLOWS.has(rememberedWorkflow)) get("#onboarding-workflow").value = rememberedWorkflow;
updateCommand();
showPanel();
