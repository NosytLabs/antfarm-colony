import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveAntfarmRoot } from "../installer/paths.js";

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

function logPaths(): { dir: string; file: string } {
  const dir = path.join(resolveAntfarmRoot(), "logs");
  return { dir, file: path.join(dir, "workflow.log") };
}

export type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  workflowId?: string;
  runId?: string;
  stepId?: string;
  message: string;
}

let readyDir: string | null = null;

function ensureLogDirSync(): void {
  const { dir } = logPaths();
  if (readyDir === dir) return;
  fs.mkdirSync(dir, { recursive: true });
  readyDir = dir;
}

function rotateIfNeededSync(): void {
  try {
    const { file } = logPaths();
    const stats = fs.statSync(file);
    if (stats.size > MAX_LOG_SIZE) {
      const rotatedPath = `${file}.1`;
      fs.renameSync(file, rotatedPath);
    }
  } catch {
    // File doesn't exist yet, no rotation needed
  }
}

export function formatEntry(entry: LogEntry): string {
  const parts = [entry.timestamp, `[${entry.level.toUpperCase()}]`];

  if (entry.workflowId) {
    parts.push(`[${entry.workflowId}]`);
  }
  if (entry.runId) {
    parts.push(`[${entry.runId.slice(0, 8)}]`);
  }
  if (entry.stepId) {
    parts.push(`[${entry.stepId}]`);
  }

  parts.push(entry.message);
  return parts.join(" ");
}

export function log(
  level: LogLevel,
  message: string,
  context?: { workflowId?: string; runId?: string; stepId?: string }
): void {
  try {
    ensureLogDirSync();
    rotateIfNeededSync();

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };

    const line = formatEntry(entry) + "\n";
    fs.appendFileSync(logPaths().file, line, "utf-8");
  } catch {
    // Logging must never throw into the caller
  }
}

export const logger = {
  info: (msg: string, ctx?: { workflowId?: string; runId?: string; stepId?: string }): void =>
    log("info", msg, ctx),
  warn: (msg: string, ctx?: { workflowId?: string; runId?: string; stepId?: string }): void =>
    log("warn", msg, ctx),
  error: (msg: string, ctx?: { workflowId?: string; runId?: string; stepId?: string }): void =>
    log("error", msg, ctx),
  debug: (msg: string, ctx?: { workflowId?: string; runId?: string; stepId?: string }): void =>
    log("debug", msg, ctx),
};

export async function readRecentLogs(lines: number = 50): Promise<string[]> {
  try {
    const content = await readFile(logPaths().file, "utf-8");
    const allLines = content.trim().split("\n");
    return allLines.slice(-lines);
  } catch {
    return [];
  }
}
