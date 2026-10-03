import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db.js";
import { getRunEvents } from "../installer/events.js";
import { resolveOpenClawConfigPath, resolveWorkflowDir } from "../installer/paths.js";
import { resumeWorkflowRun, ResumeConflictError } from "../installer/resume.js";
import { runWorkflow } from "../installer/run.js";
import { stopWorkflow } from "../installer/status.js";
import { getMedicStatus, getRecentMedicChecks } from "../medic/medic.js";
import { getColonyState, getRunById, getRuns, isOpenClawConfigured, loadWorkflows } from "./colony-state.js";
import { cancelRepositorySurvey, createRepositorySurvey, getActiveSurveyCount, SurveyCapacityError } from "./survey.js";
import { BridgeValidationError, recordBridgeEvent } from "./bridge.js";

import { readDashboardConfig, resolveDashboardPort } from "./config.js";
import { startHarnessRun, cancelHarnessRun, resumeHarnessRun, isHarnessWorkflow, HarnessError, recoverHarnessRuns } from './harness.js';
import { inspectAntseed } from "../integrations/antseed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..", "..", "web");
const MAX_BODY_BYTES = 32 * 1024;

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export interface DashboardOptions { workspace?: string; host?: string }

function json(res: http.ServerResponse, data: unknown, status = 200, extra: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra });
  res.end(JSON.stringify(data));
}

function methodNotAllowed(res: http.ServerResponse, allowed: string[]): void {
  json(res, { error: `Method not allowed; use ${allowed.join(" or ")}` }, 405, { Allow: allowed.join(", ") });
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, `Request body exceeds ${MAX_BODY_BYTES} bytes`);
    chunks.push(buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("body must be an object");
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new HttpError(400, `Malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateRequestHost(req: http.IncomingMessage, configuredHost: string, requireSameOrigin: boolean): void {
  const rawHost = req.headers.host;
  if (!rawHost) throw new HttpError(400, "Host header is required");
  let hostname: string;
  try { hostname = new URL(`http://${rawHost}`).hostname.toLowerCase(); }
  catch { throw new HttpError(400, "Invalid Host header"); }
  const allowed = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!new Set(["0.0.0.0", "::"]).has(configuredHost.toLowerCase())) allowed.add(configuredHost.toLowerCase());
  if (!allowed.has(hostname)) throw new HttpError(403, "Host is not allowed");
  if (requireSameOrigin && req.headers.origin) {
    let originHost: string;
    try { originHost = new URL(req.headers.origin).host.toLowerCase(); }
    catch { throw new HttpError(403, "Invalid Origin header"); }
    if (originHost !== rawHost.toLowerCase()) throw new HttpError(403, "Cross-origin mutation rejected");
  }
}

function typeFor(file: string): string {
  return ({ ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".woff2": "font/woff2" } as Record<string, string>)[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): void {
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { throw new HttpError(400, "Malformed URL path"); }
  if (decoded.includes("\0")) throw new HttpError(400, "Malformed URL path");
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const root = fs.realpathSync(WEB_ROOT);
  const candidate = path.resolve(root, relative);
  if (!(candidate === root || candidate.startsWith(`${root}${path.sep}`))) throw new HttpError(403, "Path traversal rejected");
  let stat: fs.Stats;
  let file: string;
  try { file = fs.realpathSync(candidate); stat = fs.statSync(file); } catch { throw new HttpError(404, "Not found"); }
  if (!(file === root || file.startsWith(`${root}${path.sep}`))) throw new HttpError(403, "Static symlink leaves the web root");
  if (!stat.isFile()) throw new HttpError(404, "Not found");
  res.writeHead(200, { "Content-Type": typeFor(file), "Content-Length": stat.size, "Cache-Control": path.basename(file) === "index.html" ? "no-cache" : "no-cache", "X-Content-Type-Options": "nosniff" });
  if (req.method === "HEAD") res.end(); else fs.createReadStream(file).pipe(res);
}

function stringField(body: Record<string, unknown>, field: string, max: number): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `${field} must be a non-empty string`);
  if (value.trim().length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return value.trim();
}

function ensureRuntime(workflowId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(workflowId)) throw new HttpError(400, "Invalid workflowId");
  if (!isOpenClawConfigured()) throw new HttpError(503, `OpenClaw runtime is not configured with a readable config at ${resolveOpenClawConfigPath()}`);
  if (!fs.existsSync(path.join(resolveWorkflowDir(workflowId), "workflow.yml"))) throw new HttpError(409, `Workflow '${workflowId}' is not installed; install it with the Antfarm CLI first`);
}

export function createDashboardServer(options: DashboardOptions = {}): http.Server {
  const workspace = path.resolve(options.workspace ?? (process.env.ANTFARM_WORKSPACE?.trim() || readDashboardConfig().workspace || process.cwd()));
  const host = options.host ?? (process.env.HOST?.trim() || "127.0.0.1");
  recoverHarnessRuns();
  return http.createServer(async (req, res) => {
    try {
      const method = req.method ?? "GET";
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const route = url.pathname;
      const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
      if (route === "/api" || route.startsWith("/api/")) validateRequestHost(req, host, mutation);
      if (method === "OPTIONS") return methodNotAllowed(res, ["GET", "POST"]);

      if (route === "/api/health") {
        if (method !== "GET") return methodNotAllowed(res, ["GET"]);
        getDb().prepare("SELECT 1").get();
        return json(res, { status: "ok", mode: "live", workspace, activeSurveys: getActiveSurveyCount() });
      }
      if (route === "/api/state") {
        if (method !== "GET") return methodNotAllowed(res, ["GET"]);
        return json(res, getColonyState(workspace));
      }
      if (route === "/api/providers/antseed") {
        if (method !== "GET") return methodNotAllowed(res, ["GET"]);
        return json(res, await inspectAntseed());
      }
      if (route === "/api/workflows") {
        if (method !== "GET") return methodNotAllowed(res, ["GET"]);
        return json(res, loadWorkflows());
      }
      if (route === "/api/runs") {
        if (method === "GET") return json(res, getRuns(url.searchParams.get("workflow") ?? undefined));
        if (method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
        const body = await readJson(req);
        const workflowId = stringField(body, "workflowId", 64);
        const task = stringField(body, "task", 10_000);
        if (isHarnessWorkflow(workflowId)) {
          try { return json(res, startHarnessRun(workflowId, stringField(body, 'runtime', 32), task, workspace), 201); }
          catch (error) { if (error instanceof HarnessError) throw new HttpError(409, error.message); throw error; }
        }
        ensureRuntime(workflowId);
        try { return json(res, await runWorkflow({ workflowId, taskTitle: task }), 201); }
        catch (error) { throw new HttpError(503, `Workflow could not start: ${error instanceof Error ? error.message : String(error)}`); }
      }
      if (route === "/api/survey") {
        if (method !== "POST") return methodNotAllowed(res, ["POST"]);
        const body = await readJson(req);
        if (body.title !== undefined && (typeof body.title !== "string" || body.title.trim().length > 200)) throw new HttpError(400, "title must be a string of at most 200 characters");
        try {
          const run = await createRepositorySurvey({ title: body.title as string | undefined, workspace });
          return json(res, { run, tasks: getRunById(run.id)!.steps }, 202);
        } catch (error) {
          if (error instanceof SurveyCapacityError) throw new HttpError(429, error.message);
          throw error;
        }
      }
      if (route === "/api/bridge/events") {
        if (method !== "POST") return methodNotAllowed(res, ["POST"]);
        const body = await readJson(req);
        try { return json(res, recordBridgeEvent(body), 202); }
        catch (error) {
          if (error instanceof BridgeValidationError) throw new HttpError(400, error.message);
          throw error;
        }
      }

      const action = route.match(/^\/api\/runs\/([^/]+)\/(cancel|resume)$/);
      if (action) {
        if (method !== "POST") return methodNotAllowed(res, ["POST"]);
        const runId = action[1];
        if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new HttpError(400, "Invalid run ID");
        const run = getRunById(runId);
        if (!run) throw new HttpError(404, "Run not found");
        if (isHarnessWorkflow(run.workflow_id)) {
          try { return json(res, action[2] === 'cancel' ? cancelHarnessRun(runId) : resumeHarnessRun(runId, workspace)); }
          catch (error) { throw new HttpError(409, error instanceof Error ? error.message : String(error)); }
        }
        if (action[2] === "cancel") {
          if (run.workflow_id === "repository-survey") {
            try { return json(res, cancelRepositorySurvey(runId)); }
            catch (error) { throw new HttpError(409, error instanceof Error ? error.message : String(error)); }
          }
          const result = await stopWorkflow(runId);
          if (result.status !== "ok") throw new HttpError(result.status === "not_found" ? 404 : 409, result.message);
          return json(res, result);
        }
        try { return json(res, await resumeWorkflowRun(runId)); }
        catch (error) {
          if (error instanceof ResumeConflictError) throw new HttpError(409, error.message);
          if (error instanceof Error && error.message === "Run not found") throw new HttpError(404, error.message);
          throw new HttpError(503, `Run could not resume: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const events = route.match(/^\/api\/runs\/([^/]+)\/events$/);
      if (events) { if (method !== "GET") return methodNotAllowed(res, ["GET"]); return json(res, getRunEvents(events[1])); }
      const stories = route.match(/^\/api\/runs\/([^/]+)\/stories$/);
      if (stories) { if (method !== "GET") return methodNotAllowed(res, ["GET"]); return json(res, getDb().prepare("SELECT * FROM stories WHERE run_id = ? ORDER BY story_index ASC").all(stories[1])); }
      const run = route.match(/^\/api\/runs\/([^/]+)$/);
      if (run) { if (method !== "GET") return methodNotAllowed(res, ["GET"]); const data = getRunById(run[1]); return data ? json(res, data) : json(res, { error: "Run not found" }, 404); }
      if (route === "/api/medic/status") { if (method !== "GET") return methodNotAllowed(res, ["GET"]); return json(res, getMedicStatus()); }
      if (route === "/api/medic/checks") { if (method !== "GET") return methodNotAllowed(res, ["GET"]); const n = Number.parseInt(url.searchParams.get("limit") ?? "20", 10); return json(res, getRecentMedicChecks(Number.isFinite(n) ? Math.min(Math.max(n, 1), 200) : 20)); }
      if (route.startsWith("/api/")) throw new HttpError(404, "API route not found");
      if (method !== "GET" && method !== "HEAD") return methodNotAllowed(res, ["GET", "HEAD"]);
      serveStatic(req, res, route);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : String(error);
      json(res, { error: status === 500 ? `Internal server error: ${message}` : message }, status);
    }
  });
}

export function startDashboard(port = resolveDashboardPort(), options: DashboardOptions = {}): http.Server {
  const host = options.host ?? (process.env.HOST?.trim() || "127.0.0.1");
  const server = createDashboardServer({ ...options, host });
  server.listen(port, host, () => { const address=server.address(); console.log(`Antfarm Colony: http://${host}:${address && typeof address!=='string'?address.port:port}`); });
  return server;
}
