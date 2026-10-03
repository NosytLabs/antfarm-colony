import { getDb } from "../db.js";
import { ensureWorkflowCrons } from "./agent-cron.js";
import { emitEvent } from "./events.js";
import { resolveWorkflowDir } from "./paths.js";
import { loadWorkflowSpec } from "./workflow-spec.js";

export class ResumeConflictError extends Error {}

export async function resumeWorkflowRun(runId: string): Promise<{ id: string; workflowId: string; status: "running" }> {
  const db = getDb();
  const run = db.prepare("SELECT id, workflow_id, status FROM runs WHERE id = ?").get(runId) as
    { id: string; workflow_id: string; status: string } | undefined;
  if (!run) throw new Error("Run not found");
  if (run.workflow_id === "repository-survey") throw new ResumeConflictError("Repository surveys cannot be resumed; start a new survey");
  if (run.status !== "failed") throw new ResumeConflictError(`Run is ${run.status}, so it cannot be resumed`);

  const failedStep = db.prepare(
    "SELECT id, step_id, type FROM steps WHERE run_id = ? AND status = 'failed' ORDER BY step_index ASC LIMIT 1"
  ).get(run.id) as { id: string; step_id: string; type: string } | undefined;
  if (!failedStep) throw new ResumeConflictError("Run has no failed step to resume");

  const workflow = await loadWorkflowSpec(resolveWorkflowDir(run.workflow_id));
  await ensureWorkflowCrons(workflow);

  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = db.prepare("SELECT status FROM runs WHERE id = ?").get(run.id) as { status: string };
    if (current.status !== "failed") throw new ResumeConflictError(`Run changed to ${current.status} before it could be resumed`);

    const loopStep = db.prepare(
      "SELECT id, loop_config FROM steps WHERE run_id = ? AND type = 'loop' AND status IN ('running', 'failed') LIMIT 1"
    ).get(run.id) as { id: string; loop_config: string | null } | undefined;
    let handledVerifyLoop = false;
    if (loopStep?.loop_config) {
      const config = JSON.parse(loopStep.loop_config) as { verifyEach?: boolean; verifyStep?: string };
      if (config.verifyEach && config.verifyStep === failedStep.step_id) {
        db.prepare("UPDATE steps SET status = 'pending', current_story_id = NULL, retry_count = 0, updated_at = ? WHERE id = ?").run(now, loopStep.id);
        db.prepare("UPDATE steps SET status = 'waiting', current_story_id = NULL, retry_count = 0, updated_at = ? WHERE id = ?").run(now, failedStep.id);
        db.prepare("UPDATE stories SET status = 'pending', updated_at = ? WHERE run_id = ? AND status = 'failed'").run(now, run.id);
        handledVerifyLoop = true;
      }
    }
    if (!handledVerifyLoop) {
      if (failedStep.type === "loop") {
        db.prepare("UPDATE stories SET status = 'pending', updated_at = ? WHERE run_id = ? AND status = 'failed'").run(now, run.id);
      }
      db.prepare("UPDATE steps SET status = 'pending', current_story_id = NULL, retry_count = 0, updated_at = ? WHERE id = ?").run(now, failedStep.id);
    }
    db.prepare("UPDATE runs SET status = 'running', updated_at = ? WHERE id = ?").run(now, run.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  emitEvent({ ts: now, event: "step.pending", runId: run.id, workflowId: run.workflow_id, stepId: failedStep.step_id, detail: "Run resumed" });
  return { id: run.id, workflowId: run.workflow_id, status: "running" };
}
