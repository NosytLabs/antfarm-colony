import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getDb, nextRunNumber } from "../db.js";
import { emitEvent } from "../installer/events.js";

const SURVEY_WORKFLOW_ID = "repository-survey";
const MAX_CONCURRENT_SURVEYS = 2;
const MAX_FILES = 4_000;
const MAX_DIRECTORIES = 2_000;
const MAX_BYTES_READ = 16 * 1024 * 1024;
const MAX_FILE_BYTES = 256 * 1024;
const SKIP_DIRECTORIES = new Set([
  ".git", "node_modules", ".hg", ".svn", "dist", "build", "coverage",
  ".next", ".nuxt", ".output", ".cache", ".venv", "venv", "__pycache__",
]);
const activeSurveys = new Set<string>();
const cancelledSurveys = new Set<string>();

interface SurveyFile {
  absolute: string;
  relative: string;
  size: number;
  extension: string;
}

interface Inventory {
  root: string;
  files: SurveyFile[];
  directories: number;
  skippedSymlinks: number;
  skippedSensitive: number;
  skippedDirectories: number;
  totalBytes: number;
  truncated: boolean;
}

export interface SurveyRun {
  id: string;
  runNumber: number;
  workflowId: string;
  task: string;
  status: "running";
}

export class SurveyCapacityError extends Error {}
class SurveyCancelledError extends Error {}

export function getActiveSurveyCount(): number {
  return activeSurveys.size;
}

function throwIfCancelled(runId: string): void {
  if (cancelledSurveys.has(runId)) throw new SurveyCancelledError("Survey cancelled by user");
}

function isSensitiveName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === ".env" || lower.startsWith(".env.") ||
    lower === "credentials" || lower === "credentials.json" ||
    lower === "id_rsa" || lower === "id_ed25519" ||
    lower.includes("secret") || lower.endsWith(".pem") || lower.endsWith(".key");
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function inventoryRepository(configuredRoot: string, runId: string): Promise<Inventory> {
  const root = await fs.realpath(configuredRoot);
  const rootStat = await fs.stat(root);
  if (!rootStat.isDirectory()) throw new Error(`Survey workspace is not a directory: ${configuredRoot}`);

  const inventory: Inventory = {
    root,
    files: [],
    directories: 0,
    skippedSymlinks: 0,
    skippedSensitive: 0,
    skippedDirectories: 0,
    totalBytes: 0,
    truncated: false,
  };
  const pending = [root];

  while (pending.length > 0) {
    throwIfCancelled(runId);
    if (inventory.files.length >= MAX_FILES || inventory.directories >= MAX_DIRECTORIES) {
      inventory.truncated = true;
      break;
    }
    const directory = pending.pop()!;
    if (!isWithinRoot(root, directory)) throw new Error("Survey attempted to leave its configured workspace");
    inventory.directories += 1;
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (inventory.files.length >= MAX_FILES) {
        inventory.truncated = true;
        break;
      }
      const absolute = path.join(directory, entry.name);
      if (!isWithinRoot(root, absolute)) throw new Error("Survey attempted to leave its configured workspace");
      if (entry.isSymbolicLink()) {
        inventory.skippedSymlinks += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name) && !isSensitiveName(entry.name)) pending.push(absolute);
        else if (isSensitiveName(entry.name)) inventory.skippedSensitive += 1;
        else inventory.skippedDirectories += 1;
        continue;
      }
      if (!entry.isFile()) continue;
      if (isSensitiveName(entry.name)) {
        inventory.skippedSensitive += 1;
        continue;
      }
      let stat;
      try {
        stat = await fs.lstat(absolute);
      } catch {
        continue;
      }
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      inventory.totalBytes += stat.size;
      inventory.files.push({
        absolute,
        relative: path.relative(root, absolute),
        size: stat.size,
        extension: path.extname(entry.name).toLowerCase() || "[none]",
      });
    }
  }
  return inventory;
}

function inventoryReport(inventory: Inventory): string {
  const extensions = new Map<string, number>();
  for (const file of inventory.files) extensions.set(file.extension, (extensions.get(file.extension) ?? 0) + 1);
  const topExtensions = [...extensions.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([extension, count]) => ({ extension, count }));
  return JSON.stringify({
    report: "repository inventory",
    workspace: inventory.root,
    files: inventory.files.length,
    directories: inventory.directories,
    totalBytes: inventory.totalBytes,
    topExtensions,
    skipped: { symlinks: inventory.skippedSymlinks, sensitivePaths: inventory.skippedSensitive, generatedOrDependencyDirectories: inventory.skippedDirectories },
    limits: { maxFiles: MAX_FILES, maxDirectories: MAX_DIRECTORIES },
    truncated: inventory.truncated,
  }, null, 2);
}

interface QualityReport {
  filesInspected: number;
  bytesInspected: number;
  skippedLargeOrBinary: number;
  truncated: boolean;
  signals: Array<{ severity: "info" | "warning"; rule: string; file: string; line?: number }>;
  repositoryChecks: Record<string, boolean>;
}

function appearsBinary(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, 8_192);
  for (let i = 0; i < limit; i += 1) if (buffer[i] === 0) return true;
  return false;
}

async function scanQuality(inventory: Inventory, runId: string): Promise<QualityReport> {
  const relativeNames = new Set(inventory.files.map((file) => file.relative.toLowerCase()));
  const report: QualityReport = {
    filesInspected: 0,
    bytesInspected: 0,
    skippedLargeOrBinary: 0,
    truncated: inventory.truncated,
    signals: [],
    repositoryChecks: {
      readme: [...relativeNames].some((name) => /^readme(?:\.|$)/.test(name)),
      license: [...relativeNames].some((name) => /(^|\/)licen[sc]e(?:\.|$)/.test(name)),
      gitignore: relativeNames.has(".gitignore"),
      tests: [...relativeNames].some((name) => /(^|\/)(test|tests|__tests__)(\/|$)|\.(test|spec)\.[^.]+$/.test(name)),
    },
  };

  for (const file of inventory.files) {
    throwIfCancelled(runId);
    if (report.bytesInspected >= MAX_BYTES_READ) {
      report.truncated = true;
      break;
    }
    if (file.size > MAX_FILE_BYTES) {
      report.skippedLargeOrBinary += 1;
      continue;
    }
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(file.absolute);
    } catch {
      continue;
    }
    if (appearsBinary(buffer)) {
      report.skippedLargeOrBinary += 1;
      continue;
    }
    report.filesInspected += 1;
    report.bytesInspected += buffer.length;
    if (report.signals.length >= 200) continue;
    const lines = buffer.toString("utf8").split(/\r?\n/);
    for (let index = 0; index < lines.length && report.signals.length < 200; index += 1) {
      const line = lines[index];
      if (/\b(TODO|FIXME|HACK|XXX)\b/.test(line)) {
        report.signals.push({ severity: "info", rule: "unfinished-work-marker", file: file.relative, line: index + 1 });
      }
      if (line.length > 300) {
        report.signals.push({ severity: "warning", rule: "very-long-line", file: file.relative, line: index + 1 });
      }
    }
  }

  if (report.signals.length >= 200) report.truncated = true;
  return report;
}

function summaryReport(inventory: Inventory, quality: QualityReport): string {
  const missing = Object.entries(quality.repositoryChecks).filter(([, present]) => !present).map(([name]) => name);
  const warnings = quality.signals.filter((signal) => signal.severity === "warning").length;
  return JSON.stringify({
    report: "repository survey summary",
    workspace: inventory.root,
    scope: {
      filesFound: inventory.files.length,
      filesInspected: quality.filesInspected,
      bytesInspected: quality.bytesInspected,
    },
    findings: {
      missingRepositoryFiles: missing,
      warningSignals: warnings,
      informationalSignals: quality.signals.length - warnings,
      signals: quality.signals,
    },
    skipped: {
      symlinks: inventory.skippedSymlinks,
      sensitivePaths: inventory.skippedSensitive,
      generatedOrDependencyDirectories: inventory.skippedDirectories,
      largeOrBinaryFiles: quality.skippedLargeOrBinary,
    },
    truncated: inventory.truncated || quality.truncated,
    note: "This is a deterministic, read-only repository audit. Findings are signals for review, not proof of defects.",
  }, null, 2);
}

function setStepStatus(runId: string, stepId: string, status: string, output?: string): void {
  throwIfCancelled(runId);
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare("UPDATE steps SET status = ?, output = COALESCE(?, output), updated_at = ? WHERE run_id = ? AND step_id = ?")
    .run(status, output ?? null, now, runId, stepId);
  db.prepare("UPDATE runs SET updated_at = ? WHERE id = ?").run(now, runId);
}

async function executeSurvey(runId: string, workspace: string): Promise<void> {
  try {
    throwIfCancelled(runId);
    setStepStatus(runId, "inventory", "running");
    emitEvent({ ts: new Date().toISOString(), event: "step.running", runId, workflowId: SURVEY_WORKFLOW_ID, stepId: "inventory", agentId: "repository-survey_scout" });
    const inventory = await inventoryRepository(workspace, runId);
    setStepStatus(runId, "inventory", "done", inventoryReport(inventory));
    emitEvent({ ts: new Date().toISOString(), event: "step.done", runId, workflowId: SURVEY_WORKFLOW_ID, stepId: "inventory", agentId: "repository-survey_scout" });

    setStepStatus(runId, "quality-scan", "running");
    emitEvent({ ts: new Date().toISOString(), event: "step.running", runId, workflowId: SURVEY_WORKFLOW_ID, stepId: "quality-scan", agentId: "repository-survey_tester" });
    throwIfCancelled(runId);
    const quality = await scanQuality(inventory, runId);
    setStepStatus(runId, "quality-scan", "done", JSON.stringify({ report: "quality scan", ...quality }, null, 2));
    emitEvent({ ts: new Date().toISOString(), event: "step.done", runId, workflowId: SURVEY_WORKFLOW_ID, stepId: "quality-scan", agentId: "repository-survey_tester" });

    throwIfCancelled(runId);
    setStepStatus(runId, "summary", "running");
    emitEvent({ ts: new Date().toISOString(), event: "step.running", runId, workflowId: SURVEY_WORKFLOW_ID, stepId: "summary", agentId: "repository-survey_reviewer" });
    setStepStatus(runId, "summary", "done", summaryReport(inventory, quality));
    const now = new Date().toISOString();
    getDb().prepare("UPDATE runs SET status = 'completed', updated_at = ? WHERE id = ?").run(now, runId);
    emitEvent({ ts: now, event: "step.done", runId, workflowId: SURVEY_WORKFLOW_ID, stepId: "summary", agentId: "repository-survey_reviewer" });
    emitEvent({ ts: now, event: "run.completed", runId, workflowId: SURVEY_WORKFLOW_ID });
  } catch (error) {
    if (error instanceof SurveyCancelledError) return;
    const message = error instanceof Error ? error.message : String(error);
    const now = new Date().toISOString();
    const db = getDb();
    db.prepare("UPDATE steps SET status = 'failed', output = ?, updated_at = ? WHERE run_id = ? AND status = 'running'").run(message, now, runId);
    db.prepare("UPDATE steps SET status = 'failed', output = ?, updated_at = ? WHERE run_id = ? AND status IN ('waiting', 'pending')").run(`Not run because survey failed: ${message}`, now, runId);
    db.prepare("UPDATE runs SET status = 'failed', updated_at = ? WHERE id = ?").run(now, runId);
    emitEvent({ ts: now, event: "run.failed", runId, workflowId: SURVEY_WORKFLOW_ID, detail: message });
  } finally {
    activeSurveys.delete(runId);
    cancelledSurveys.delete(runId);
  }
}

export function cancelRepositorySurvey(runId: string): { id: string; status: "cancelled" } {
  const db = getDb();
  const run = db.prepare("SELECT status FROM runs WHERE id = ? AND workflow_id = ?").get(runId, SURVEY_WORKFLOW_ID) as { status: string } | undefined;
  if (!run) throw new Error("Run not found");
  if (run.status !== "running") throw new Error(`Run is already ${run.status}`);
  cancelledSurveys.add(runId);
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE runs SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'running'").run(now, runId);
    db.prepare("UPDATE steps SET status = 'failed', output = 'Cancelled by user', updated_at = ? WHERE run_id = ? AND status IN ('waiting', 'pending', 'running')").run(now, runId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  emitEvent({ ts: now, event: "run.failed", runId, workflowId: SURVEY_WORKFLOW_ID, detail: "Cancelled by user" });
  return { id: runId, status: "cancelled" };
}

export async function createRepositorySurvey(params: { title?: string; workspace: string }): Promise<SurveyRun> {
  if (activeSurveys.size >= MAX_CONCURRENT_SURVEYS) {
    throw new SurveyCapacityError(`At most ${MAX_CONCURRENT_SURVEYS} repository surveys may run at once`);
  }
  const title = params.title?.trim() || "Repository survey";
  const workspace = path.resolve(params.workspace);
  const runId = crypto.randomUUID();
  activeSurveys.add(runId);
  let root: string | null = null;
  let runNumber = 0;
  const now = new Date().toISOString();
  const steps = [
    { id: "inventory", agent: "repository-survey_scout", status: "pending", expects: "Repository inventory JSON" },
    { id: "quality-scan", agent: "repository-survey_tester", status: "waiting", expects: "Quality signal report JSON" },
    { id: "summary", agent: "repository-survey_reviewer", status: "waiting", expects: "Repository survey summary JSON" },
  ];

  try {
    root = await fs.realpath(workspace).catch(() => null);
    if (!root) throw new Error(`Survey workspace does not exist: ${workspace}`);
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) throw new Error(`Survey workspace is not a directory: ${workspace}`);
    const db = getDb();
    runNumber = nextRunNumber();
    db.exec("BEGIN");
    db.prepare("INSERT INTO runs (id, run_number, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, 'running', ?, ?, ?)")
      .run(runId, runNumber, SURVEY_WORKFLOW_ID, title, JSON.stringify({ task: title, workspace: root, kind: "survey" }), now, now);
    const insert = db.prepare("INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, max_retries, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'single', ?, ?)");
    steps.forEach((step, index) => insert.run(crypto.randomUUID(), runId, step.id, step.agent, index, `Read-only ${step.id} of ${root}`, step.expects, step.status, now, now));
    db.exec("COMMIT");
  } catch (error) {
    try { getDb().exec("ROLLBACK"); } catch {}
    activeSurveys.delete(runId);
    throw error;
  }

  emitEvent({ ts: now, event: "run.started", runId, workflowId: SURVEY_WORKFLOW_ID, detail: `Read-only survey of ${root}` });
  setImmediate(() => void executeSurvey(runId, root!));
  return { id: runId, runNumber, workflowId: SURVEY_WORKFLOW_ID, task: title, status: "running" };
}
