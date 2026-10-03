import { getDb } from "../db.js";

const MAX_SESSIONS = 100;
const MAX_EVENTS = 500;
const STALE_AFTER_MS = 15 * 60 * 1_000;

const STATUSES = new Set(["running", "idle", "blocked", "failed"] as const);
const ROLES = new Set(["scout", "builder", "verifier", "planner"] as const);
const FIELDS = new Set(["source", "sessionId", "eventId", "status", "role", "name", "tool"]);

export interface BridgeEventInput {
  source: string;
  sessionId: string;
  eventId: string;
  status: "running" | "idle" | "blocked" | "failed";
  role: "scout" | "builder" | "verifier" | "planner";
  name: string;
  tool?: string;
}

interface BridgeRow {
  event_id: string;
  source: string;
  session_id: string;
  status: BridgeEventInput["status"];
  role: BridgeEventInput["role"];
  name: string;
  tool: string | null;
  created_at: string;
  updated_at: string;
}

export class BridgeValidationError extends Error {}

function requiredString(body: Record<string, unknown>, field: string, max: number): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new BridgeValidationError(`${field} must be a non-empty string`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new BridgeValidationError(`${field} must be at most ${max} characters`);
  return trimmed;
}

export function validateBridgeEvent(body: Record<string, unknown>): BridgeEventInput {
  for (const field of Object.keys(body)) {
    if (!FIELDS.has(field)) throw new BridgeValidationError(`Unexpected field: ${field}`);
  }
  if (typeof body.source !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(body.source)) throw new BridgeValidationError("source must be a lowercase runtime name (1–32 characters)");
  const sessionId = requiredString(body, "sessionId", 120);
  const eventId = requiredString(body, "eventId", 120);
  const name = requiredString(body, "name", 60);
  if (typeof body.status !== "string" || !STATUSES.has(body.status as BridgeEventInput["status"])) {
    throw new BridgeValidationError("status must be running, idle, blocked, or failed");
  }
  if (typeof body.role !== "string" || !ROLES.has(body.role as BridgeEventInput["role"])) {
    throw new BridgeValidationError("role must be scout, builder, verifier, or planner");
  }
  let tool: string | undefined;
  if (body.tool !== undefined) {
    if (typeof body.tool !== "string" || !body.tool.trim()) throw new BridgeValidationError("tool must be a non-empty string when provided");
    tool = body.tool.trim();
    if (tool.length > 80) throw new BridgeValidationError("tool must be at most 80 characters");
  }
  return { source: body.source, sessionId, eventId, status: body.status as BridgeEventInput["status"], role: body.role as BridgeEventInput["role"], name, ...(tool ? { tool } : {}) };
}

function enforceBounds(): void {
  const db = getDb();
  db.prepare(`
    DELETE FROM bridge_events WHERE (source, session_id) IN (
      SELECT source, session_id FROM bridge_events
      GROUP BY source, session_id ORDER BY MAX(updated_at) DESC, session_id ASC
      LIMIT -1 OFFSET ?
    )
  `).run(MAX_SESSIONS);
  db.prepare(`
    DELETE FROM bridge_events WHERE (source, event_id) NOT IN (
      SELECT source, event_id FROM bridge_events ORDER BY updated_at DESC, event_id ASC LIMIT ?
    )
  `).run(MAX_EVENTS);
}

export function recordBridgeEvent(body: Record<string, unknown>): { accepted: true; event: BridgeEventInput & { lastSeen: string } } {
  const event = validateBridgeEvent(body);
  const now = new Date().toISOString();
  const db = getDb();
  db.prepare(`
    INSERT INTO bridge_events (event_id, source, session_id, status, role, name, tool, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, event_id) DO UPDATE SET
      source = excluded.source,
      session_id = excluded.session_id,
      status = excluded.status,
      role = excluded.role,
      name = excluded.name,
      tool = excluded.tool,
      updated_at = excluded.updated_at
  `).run(event.eventId, event.source, event.sessionId, event.status, event.role, event.name, event.tool ?? null, now, now);
  enforceBounds();
  return { accepted: true, event: { ...event, lastSeen: now } };
}

export function getBridgeAgents(now = Date.now()) {
  const rows = getDb().prepare(`
    SELECT event_id, source, session_id, status, role, name, tool, created_at, updated_at
    FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY source, session_id ORDER BY updated_at DESC, rowid DESC) AS rank
      FROM bridge_events
    ) WHERE rank = 1
    ORDER BY updated_at DESC, session_id ASC
    LIMIT ?
  `).all(MAX_SESSIONS) as unknown as BridgeRow[];
  return rows.map((row) => {
    const lastSeen = Date.parse(row.updated_at);
    const stale = !Number.isFinite(lastSeen) || now - lastSeen >= STALE_AFTER_MS;
    return {
      id: `${row.source}:${row.session_id}`,
      name: row.name,
      role: row.role,
      status: stale ? "idle" as const : row.status,
      task_id: null,
      last_seen: row.updated_at,
      source: row.source,
      tool: row.tool,
    };
  });
}

export function getBridgeActivity(limit = 100) {
  const bounded = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const rows = getDb().prepare(`
    SELECT event_id, source, session_id, status, role, name, tool, created_at, updated_at
    FROM bridge_events ORDER BY updated_at DESC, event_id ASC LIMIT ?
  `).all(bounded) as unknown as BridgeRow[];
  return rows.map((row) => ({
    id: `${row.source}:${row.event_id}`,
    type: `bridge.${row.status}`,
    agent_id: `${row.source}:${row.session_id}`,
    message: `${row.name} · ${row.status}${row.tool ? ` · ${row.tool}` : ""}`,
    ts: row.updated_at,
    source: row.source,
  }));
}
