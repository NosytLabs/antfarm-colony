import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import JSON5 from "json5";
import { getDb } from "../db.js";
import { getRecentEvents } from "../installer/events.js";
import { resolveBundledWorkflowsDir, resolveOpenClawConfigPath, resolveWorkflowRoot } from "../installer/paths.js";
import type { RunInfo, StepInfo } from "../installer/status.js";
import { getBridgeActivity, getBridgeAgents } from "./bridge.js";

import { harnessWorkflows, harnessAvailability } from './harness.js';

export interface WorkflowSummary {
  id: string;
  name: string;
  steps: Array<{ id: string; agent: string }>;
}

export interface ColonyTask {
  id: string;
  title: string;
  description: string;
  kind: string;
  status: "queued" | "running" | "review" | "done" | "failed" | "blocked" | "cancelled";
  assigned_to: string;
  depends_on: string[];
  created_at: string;
  updated_at: string;
  result: string | null;
  error: string | null;
  run_id: string;
  step_id: string;
  workflow_id: string;
  run_status: string;
  retry_count: number;
  expects: string;
}

export function isOpenClawConfigured(): boolean {
  try {
    const parsed: unknown = JSON5.parse(fs.readFileSync(resolveOpenClawConfigPath(), "utf8"));
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed));
  } catch {
    return false;
  }
}

interface JoinedStep extends StepInfo {
  run_task: string;
  run_status: string;
  workflow_id: string;
}

export function loadWorkflows(): WorkflowSummary[] {
  const dir = resolveBundledWorkflowsDir();
  const results: WorkflowSummary[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const ymlPath = path.join(dir, entry.name, "workflow.yml");
      if (!fs.existsSync(ymlPath)) continue;
      const parsed = YAML.parse(fs.readFileSync(ymlPath, "utf-8"));
      results.push({
        id: parsed.id ?? entry.name,
        name: parsed.name ?? entry.name,
        steps: (parsed.steps ?? []).map((step: { id: string; agent: string }) => ({ id: step.id, agent: step.agent })),
      });
    }
  } catch {
    // A missing bundled directory is represented by an empty collection.
  }
  results.push(...harnessWorkflows);
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export function getRuns(workflowId?: string): Array<RunInfo & { steps: StepInfo[] }> {
  const db = getDb();
  const runs = workflowId
    ? db.prepare("SELECT * FROM runs WHERE workflow_id = ? ORDER BY created_at DESC").all(workflowId) as RunInfo[]
    : db.prepare("SELECT * FROM runs ORDER BY created_at DESC").all() as RunInfo[];
  const findSteps = db.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step_index ASC");
  return runs.map((run) => ({ ...run, steps: findSteps.all(run.id) as StepInfo[] }));
}

export function getRunById(id: string): (RunInfo & { steps: StepInfo[] }) | null {
  const db = getDb();
  const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunInfo | undefined;
  if (!run) return null;
  const steps = db.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step_index ASC").all(run.id) as StepInfo[];
  return { ...run, steps };
}

function localAgentId(agentId: string): string {
  const separator = agentId.lastIndexOf("_");
  return separator === -1 ? agentId : agentId.slice(separator + 1);
}

function normalizeRole(agentId: string): "planner" | "scout" | "builder" | "verifier" | "tester" | "reviewer" {
  const id = localAgentId(agentId).toLowerCase();
  if (id.includes("planner") || id === "plan") return "planner";
  if (["scout", "scanner", "triager", "investigator", "prioritizer", "researcher"].some((role) => id.includes(role))) return "scout";
  if (id.includes("verifier") || id.includes("verify")) return "verifier";
  if (id.includes("tester") || id.includes("test")) return "tester";
  if (id.includes("reviewer") || id.includes("review") || id === "summary") return "reviewer";
  return "builder";
}

function normalizeStatus(step: JoinedStep): ColonyTask["status"] {
  if (step.status === "done" || step.status === "completed") return "done";
  if (step.run_status === "cancelled") return "cancelled";
  if (step.status === "failed") return "failed";
  if (step.status === "running") return normalizeRole(step.agent_id) === "reviewer" ? "review" : "running";
  if (step.status === "pending" || step.status === "waiting") return "queued";
  return "blocked";
}

function humanize(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function getTasks(): ColonyTask[] {
  const rows = getDb().prepare(`
    SELECT steps.*, runs.task AS run_task, runs.status AS run_status, runs.workflow_id AS workflow_id
    FROM steps JOIN runs ON runs.id = steps.run_id
    ORDER BY runs.created_at DESC, steps.step_index ASC
  `).all() as unknown as JoinedStep[];
  const previousByRun = new Map<string, string>();
  return rows.map((step) => {
    const previous = previousByRun.get(step.run_id);
    previousByRun.set(step.run_id, step.id);
    const status = normalizeStatus(step);
    return {
      id: step.id,
      title: `${step.run_task} · ${humanize(step.step_id)}`,
      description: step.input_template,
      kind: step.workflow_id === "repository-survey" ? "survey" : normalizeRole(step.agent_id),
      status,
      assigned_to: step.agent_id,
      depends_on: previous ? [previous] : [],
      created_at: step.created_at,
      updated_at: step.updated_at,
      result: ["done", "running", "review"].includes(status) ? step.output : null,
      error: status === "failed" || status === "cancelled" ? step.output : null,
      run_id: step.run_id,
      step_id: step.step_id,
      workflow_id: step.workflow_id,
      run_status: step.run_status,
      retry_count: step.retry_count,
      expects: step.expects,
    };
  });
}

export function getColonyState(workspace: string) {
  const tasks = getTasks();
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const latestByAgent = new Map<string, ColonyTask>();
  for (const task of tasks) {
    const current = latestByAgent.get(task.assigned_to);
    const taskActive = task.status === "running" || task.status === "review" || task.status === "queued";
    const currentActive = current && (current.status === "running" || current.status === "review" || current.status === "queued");
    if (!current || (taskActive && !currentActive) || (taskActive === Boolean(currentActive) && task.updated_at > current.updated_at)) {
      latestByAgent.set(task.assigned_to, task);
    }
  }
  const agents = [...latestByAgent.entries()].map(([id, task]) => ({
    id,
    name: humanize(localAgentId(id)),
    role: normalizeRole(id),
    status: task.status,
    task_id: taskById.has(task.id) ? task.id : null,
    last_seen: task.updated_at,
    source: task.assigned_to.startsWith("cli-") ? task.assigned_to.split("-")[1] : "antfarm",
    tool: null,
  }));
  const allAgents = [...agents, ...getBridgeAgents()].sort((a, b) => a.name.localeCompare(b.name));

  const counts: Record<string, number> = { queued: 0, running: 0, review: 0, done: 0, failed: 0, blocked: 0, cancelled: 0 };
  for (const task of tasks) counts[task.status] += 1;
  const schedulerEvents = getRecentEvents(100).map((event, index) => ({
    id: `${event.runId}:${event.ts}:${index}`,
    type: event.event,
    message: event.detail ?? ([event.agentId, event.stepId, event.storyTitle].filter(Boolean).join(" · ") || humanize(event.event)),
    ts: event.ts,
    source: "antfarm" as const,
    run_id: event.runId,
    agent_id: event.agentId,
    step_id: event.stepId,
  }));
  const events = [...schedulerEvents, ...getBridgeActivity(100)]
    .sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 100);

  let installedWorkflows: string[] = [];
  try {
    installedWorkflows = fs.readdirSync(resolveWorkflowRoot(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(resolveWorkflowRoot(), entry.name, "workflow.yml")))
      .map((entry) => entry.name).sort();
  } catch {}
  const openclawConfigured = isOpenClawConfigured();

  return {
    mode: "live" as const,
    agents: allAgents,
    tasks,
    events,
    stats: { total: tasks.length, ...counts },
    config: { openclawConfigured, runtimeAvailable: openclawConfigured && installedWorkflows.length > 0, installedWorkflows, workspace, harnesses: harnessAvailability() },
    workflows: loadWorkflows(),
  };
}
