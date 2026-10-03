# Colony architecture

Antfarm Colony is independent of Agent Office. Node.js 24 serves the DOM/Canvas interface from web/. TypeScript implements the HTTP dashboard and CLI. The MIT engine from snarktank/antfarm supplies SQLite runs, ordered steps, agent claims, verifier gates, retries, and OpenClaw cron integration.

## State and execution

ANTFARM_HOME isolates colony state. ANTFARM_WORKSPACE selects the read-only survey root. The survey performs inventory, quality checks, and synthesis without executing repository code or calling a model. Feature-development, bug-fix and security-audit teams require a separately configured OpenClaw runtime. Installation is explicit, never a side effect of visiting the dashboard.

GET /api/state returns normalized agents, tasks, events, workflow definitions, readiness and counts. GET /api/runs/:id returns a run. Mutations are POST /api/survey, /api/runs and /api/runs/:id/cancel or /resume. The server validates requests and binds to loopback.

Task IDs are real step IDs. Completed predecessors leave trails that fade over time. Trails explain handoffs; they do not control scheduling or implement ant colony optimization. SQLite and the runtime remain shared dependencies, so independent polling is not full decentralized fault tolerance.

## Scene

| Chamber | Meaning |
| --- | --- |
| Foraging grounds | Research and discovery |
| Queen’s chamber | Planning and shared context |
| Workshop | Implementation and repair |
| Inspection room | Verification and blocked work |
| Granary | Completed results |
| Nursery | Queued and idle workers |

The queen is a visual metaphor, not a biological manager. Shared role mapping and tunnel geometry live in web/colony-model.js. Canvas animation follows task state; DOM lists provide accessible inspection. The renderer normalizes sprite scale and limits visible ants, pixel density, and draw rate. Pause, hidden tabs and reduced motion limit animation.

## Persistence and simulation

Workflow state persists in SQLite. Preferences persist in browser local storage. Achievements derive from task history. Demo mode has separate in-memory state, explicit labels, and no server mutations. Poll cancellation and generation checks prevent late live responses overwriting a demo session.

## Verification

Engine tests cover workflow behavior. HTTP tests cover surveys and request validation. Browser tests cover asset loading, mode separation, persisted surveys, inspectors, settings, zoom and mobile overflow. External OpenClaw model execution and Antseed billing need configured services and are not inferred from local tests.


## CLI execution and observation

`src/server/harness.ts` owns child-process execution for the `cli-task` and `cli-team` workflow IDs. The existing runs/steps tables hold state and bounded public output; existing events hold transitions. Runtime detection uses PATH, native argument vectors are fixed, and custom commands come only from a server environment JSON array. The HTTP endpoint never accepts an executable or argument vector from the browser. Sequential dispatch, explicit verification, one active CLI mission per process, timeouts, process-group cancellation and restart recovery are separate from the OpenClaw cron scheduler. The UI refreshes state every four seconds and keeps an open inspector synchronized while preserving its scroll position.

The observer bridge is independent. Source/session IDs and source/event IDs are paired, preventing two tools from overwriting each other. Its schema migration preserves old OpenCode records. It stores only status metadata and does not create mission output or completed work.

The scene retains each worker's position across metadata updates. Mid-route changes finish the current tunnel segment before rerouting, new workers enter from the nursery, and deterministic work spots spread ants across chamber floors. Reduced motion intentionally settles workers immediately without ambient travel. UI navigation and browser history share one view switch; the details panel is nonmodal so users can follow the scene while reading results.
