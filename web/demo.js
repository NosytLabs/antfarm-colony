const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isoAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

const DEMO_AGENTS = [
  { id: "demo_scout_moss", name: "Moss", role: "scout", status: "running", task_id: "demo-map", last_seen: isoAgo(0) },
  { id: "demo_builder_brick", name: "Brick", role: "builder", status: "running", task_id: "demo-build", last_seen: isoAgo(1) },
  { id: "demo_tester_pip", name: "Pip", role: "tester", status: "queued", task_id: "demo-test", last_seen: isoAgo(3) },
  { id: "demo_reviewer_sage", name: "Sage", role: "reviewer", status: "review", task_id: "demo-review", last_seen: isoAgo(2) },
  { id: "demo_planner_clover", name: "Clover", role: "planner", status: "done", task_id: "demo-plan", last_seen: isoAgo(9) },
];

const DEMO_TASKS = [
  { id: "demo-plan", run_id: "demo-run-01", title: "Add keyboard navigation · Plan", description: "Map focus order and shortcuts for the colony dashboard.", kind: "planner", status: "done", assigned_to: "demo_planner_clover", depends_on: [], created_at: isoAgo(18), updated_at: isoAgo(9), result: "Sample result: documented focus order, N shortcut, Space pause behavior, and dialog escape handling.", error: null },
  { id: "demo-map", run_id: "demo-run-02", title: "Survey navigation paths · Scout", description: "Inventory the routes and interactive controls in a sample dashboard.", kind: "scout", status: "running", assigned_to: "demo_scout_moss", depends_on: [], created_at: isoAgo(12), updated_at: isoAgo(0), result: null, error: null },
  { id: "demo-build", run_id: "demo-run-01", title: "Add keyboard navigation · Build", description: "Implement accessible focus and shortcuts from the sample plan.", kind: "builder", status: "running", assigned_to: "demo_builder_brick", depends_on: ["demo-plan"], created_at: isoAgo(8), updated_at: isoAgo(1), result: null, error: null },
  { id: "demo-test", run_id: "demo-run-01", title: "Add keyboard navigation · Test", description: "Test the sample implementation with keyboard-only paths.", kind: "tester", status: "queued", assigned_to: "demo_tester_pip", depends_on: ["demo-build"], created_at: isoAgo(7), updated_at: isoAgo(3), result: null, error: null },
  { id: "demo-review", run_id: "demo-run-03", title: "Harden webhook parser · Review", description: "Review a sample patch for input validation and clear error handling.", kind: "reviewer", status: "review", assigned_to: "demo_reviewer_sage", depends_on: [], created_at: isoAgo(16), updated_at: isoAgo(2), result: null, error: null },
  { id: "demo-done", run_id: "demo-run-04", title: "Document release trail · Summary", description: "Create a concise sample release note.", kind: "reviewer", status: "done", assigned_to: "demo_reviewer_sage", depends_on: [], created_at: isoAgo(90), updated_at: isoAgo(64), result: "Sample result: release notes grouped into added, fixed, and operational guidance.", error: null },
];

const WORKFLOWS = [
  { id: "repository-survey", name: "Repository survey", steps: [{ id: "inventory", agent: "scanner" }, { id: "quality-scan", agent: "analyzer" }, { id: "summary", agent: "reporter" }] },
  {
    "id": "bug-fix",
    "name": "Bug Triage & Fix",
    "steps": [
      {
        "id": "triage",
        "agent": "triager"
      },
      {
        "id": "investigate",
        "agent": "investigator"
      },
      {
        "id": "setup",
        "agent": "setup"
      },
      {
        "id": "fix",
        "agent": "fixer"
      },
      {
        "id": "verify",
        "agent": "verifier"
      },
      {
        "id": "pr",
        "agent": "pr"
      }
    ]
  },
  {
    "id": "feature-dev",
    "name": "Feature Development Workflow",
    "steps": [
      {
        "id": "plan",
        "agent": "planner"
      },
      {
        "id": "setup",
        "agent": "setup"
      },
      {
        "id": "implement",
        "agent": "developer"
      },
      {
        "id": "verify",
        "agent": "verifier"
      },
      {
        "id": "test",
        "agent": "tester"
      },
      {
        "id": "pr",
        "agent": "developer"
      },
      {
        "id": "review",
        "agent": "reviewer"
      }
    ]
  },
  {
    "id": "security-audit",
    "name": "Security Audit & Fix",
    "steps": [
      {
        "id": "scan",
        "agent": "scanner"
      },
      {
        "id": "prioritize",
        "agent": "prioritizer"
      },
      {
        "id": "setup",
        "agent": "setup"
      },
      {
        "id": "fix",
        "agent": "fixer"
      },
      {
        "id": "verify",
        "agent": "verifier"
      },
      {
        "id": "test",
        "agent": "tester"
      },
      {
        "id": "pr",
        "agent": "pr"
      }
    ]
  },
  {
    "id": "cli-task",
    "name": "CLI specialist",
    "steps": [
      {
        "id": "work",
        "agent": "builder"
      }
    ]
  },
  {
    "id": "cli-team",
    "name": "Plan \u2192 build \u2192 verify",
    "steps": [
      {
        "id": "plan",
        "agent": "planner"
      },
      {
        "id": "build",
        "agent": "builder"
      },
      {
        "id": "verify",
        "agent": "verifier"
      }
    ]
  }
];

function stats(tasks) {
  const result = { total: tasks.length, running: 0, queued: 0, review: 0, done: 0, failed: 0, blocked: 0, cancelled: 0 };
  tasks.forEach((task) => { if (Object.hasOwn(result, task.status)) result[task.status] += 1; });
  return result;
}

export class DemoColony {
  constructor() {
    this.tasks = structuredClone(DEMO_TASKS);
    this.agents = structuredClone(DEMO_AGENTS);
    this.events = [
      { id: "de-1", type: "step.running", message: "Moss started surveying navigation paths", ts: isoAgo(0) },
      { id: "de-2", type: "step.running", message: "Brick carried the plan into the Workshop", ts: isoAgo(1) },
      { id: "de-3", type: "step.review", message: "Sage opened the webhook patch for review", ts: isoAgo(2) },
      { id: "de-4", type: "step.done", message: "Clover finished the keyboard navigation plan", ts: isoAgo(9) },
    ];
    this.timers = new Set();
    this.cancelledRuns = new Set();
  }

  getState() {
    return {
      mode: "demo",
      agents: structuredClone(this.agents),
      tasks: structuredClone(this.tasks),
      events: structuredClone(this.events),
      stats: stats(this.tasks),
      config: { openclawConfigured: false, runtimeAvailable: false, installedWorkflows: [], workspace: "/sample/acorn-app" },
      workflows: structuredClone(WORKFLOWS),
      trails: [
        { from: "demo_planner_clover", to: "demo_builder_brick", strength: .92, run_id: "demo-run-01", updated_at: isoAgo(1) },
        { from: "demo_builder_brick", to: "demo_tester_pip", strength: .45, run_id: "demo-run-01", updated_at: isoAgo(3) },
      ],
    };
  }

  async launch(workflowId, brief) {
    await wait(380);
    const workflow = WORKFLOWS.find((item) => item.id === workflowId) ?? WORKFLOWS[1];
    const runId = `demo-run-${Date.now()}`;
    const now = new Date().toISOString();
    const tasks = workflow.steps.map((step, index) => ({
      id: `${runId}-${step.id}`,
      run_id: runId,
      title: `${brief} · ${step.id.replace(/[-_]/g, " ")}`,
      description: `Demo step for “${brief}”. This is sample output and does not touch your repository.`,
      kind: step.agent,
      status: index === 0 ? "running" : "queued",
      assigned_to: `demo_${runId}_${step.agent}_${index}`,
      depends_on: index ? [`${runId}-${workflow.steps[index - 1].id}`] : [],
      created_at: now,
      updated_at: now,
      result: null,
      error: null,
    }));
    this.tasks.unshift(...tasks);
    tasks.forEach((task, index) => this.agents.push({ id: task.assigned_to, name: ["Fern", "Pebble", "Thyme", "Amber"][index] ?? `Ant ${index + 1}`, role: task.kind, status: task.status, task_id: task.id, last_seen: now }));
    this.events.unshift({ id: `event-${runId}`, type: "run.started", message: `Demo mission started: ${brief}`, ts: now });
    this.scheduleRun(tasks);
    return { id: runId, workflow_id: workflowId, status: "running", task: brief, steps: tasks };
  }

  scheduleRun(tasks) {
    tasks.forEach((task, index) => {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        if (this.cancelledRuns.has(task.run_id)) return;
        const now = new Date().toISOString();
        task.status = "done"; task.updated_at = now;
        task.result = `Sample result from ${task.kind}: completed the demo handoff.`;
        const ant = this.agents.find(item => item.id === task.assigned_to);
        if (ant) { ant.status = 'done'; ant.last_seen = now; }
        const next = tasks[index + 1];
        if (next) {
          next.status = 'running'; next.updated_at = now;
          const worker = this.agents.find(item => item.id === next.assigned_to);
          if (worker) { worker.status = 'running'; worker.last_seen = now; }
        }
        this.events.unshift({ id: `event-${task.id}`, run_id: task.run_id, agent_id: task.assigned_to, type: next ? 'step.done' : 'run.completed', message: next ? `${ant?.name || 'Ant'} finished ${task.kind}; ${next.kind} received the handoff` : 'Demo mission completed', ts: now });
        window.dispatchEvent(new CustomEvent('demo-state-change'));
      }, 12000 * (index + 1));
      this.timers.add(timer);
    });
  }

  cancel(runId) {
    this.cancelledRuns.add(runId);
    const now = new Date().toISOString();
    this.tasks.filter((task) => task.run_id === runId && ["running", "queued", "review"].includes(task.status)).forEach((task) => { task.status = "cancelled"; task.updated_at = now; });
    this.agents.filter((agent) => this.tasks.some((task) => task.run_id === runId && task.assigned_to === agent.id && task.status === "cancelled")).forEach((agent) => { agent.status = "cancelled"; });
    this.events.unshift({ id: `event-cancel-${runId}`, type: "run.cancelled", message: "Demo mission cancelled", ts: now });
    window.dispatchEvent(new CustomEvent("demo-state-change"));
  }

  destroy() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }
}

export const demoWorkflows = WORKFLOWS;
