# Runtime and editor integrations

Colony displays state from its workflow engine and optional editor telemetry. A repository survey works without an AI provider. AI workers require a configured execution runtime and a model capable of the assigned tools.

## CLI workflows: OpenCode, Hermes, and custom harnesses

Colony detects executables on the dashboard process's PATH. These commands are dispatched with `spawn`, `shell: false`, and the configured workspace as the current directory:

| Runtime | Argument vector |
| --- | --- |
| OpenCode | `opencode run --format json {prompt}` |
| Hermes | `hermes chat --format stream-json -q {prompt}` |
| Custom | Owner-provided JSON array in `ANTFARM_HARNESS_COMMAND`, containing `{prompt}` |

Set up the runtime's provider and permissions before dispatch. Native noninteractive permission failures are surfaced as failed steps; Colony does not append auto-approve flags. Custom commands should exit nonzero on failure and print progress/results on stdout. Stdin is closed. Interactive terminal applications need a noninteractive wrapper.

`cli-task` runs one builder. `cli-team` runs a planner, builder and verifier in separate processes, with bounded prior output passed to each next step. A verifier must print `VERDICT: PASS` on its own line; missing or contradictory failure verdicts block completion. Exit 0 alone cannot pass verification. Role descriptions do not impose a filesystem sandbox or prevent runtime tools from editing files.

One CLI mission is active per dashboard process, with a 30-minute limit for each step. The last 64 KiB of output is persisted; handoffs include the latest 12 KiB. On POSIX, cancellation terminates the process group and escalates after two seconds. Windows terminates the direct child only; descendant cleanup on Windows is not yet verified. Graceful server shutdown records interrupted steps as failed and stops children; an abrupt kill can leave runtime descendants that must be checked before resume. Successful steps are never replayed on resume.

Structured OpenCode and Hermes events contribute assistant text, tool names/status, final results and errors. Reasoning events and tool arguments are not shown. Custom CLI stdout is treated as user-visible output; do not emit credentials to it. Output and mission briefs are stored locally, unlike the metadata-only observer bridge below.

The commands and schemas were checked against Context7's official source references and locally installed `--help` output on 2026-10-03. Automated integration tests execute real local fixture processes and browser dispatch. Authenticated model inference through those CLIs is a separate integration check and was not performed for this release.

## Runtime-independent observations

`POST /api/bridge/events` accepts a runtime slug (lowercase letters, digits and hyphens, up to 32 characters). Event and session identity are scoped by runtime, so Hermes and OpenCode can reuse IDs safely. Existing OpenCode telemetry migrates without loss.

```json
{"source":"hermes","sessionId":"your-session","eventId":"unique-event","name":"Fern","role":"planner","status":"running","tool":"read"}
```

Roles: `scout`, `planner`, `builder`, `verifier`. Statuses: `running`, `idle`, `blocked`, `failed`. This API is an observation contract, not a native hook installer for every runtime. Each harness must send events or use the custom runner. Prompt, argument and source-code payload fields are rejected.

## OpenClaw workflow execution

Configure [OpenClaw](https://docs.openclaw.ai/) first. Select a model, start its gateway and grant the tools needed for your target repository. Then install a team explicitly:

```sh
npm run cli -- workflow list
npm run cli -- workflow install bug-fix
```

Installation provisions agent workspaces and modifies the selected OpenClaw configuration. It is not triggered by opening Colony. `OPENCLAW_CONFIG_PATH` selects a config file; otherwise `OPENCLAW_STATE_DIR/openclaw.json` or `~/.openclaw/openclaw.json` is used. Colony's state lives separately in `ANTFARM_HOME` or the `antfarm-colony` child of OpenClaw state.

Dispatch through the dashboard or CLI:

```sh
npm run cli -- workflow run bug-fix "Fix the reported bug in /absolute/path/to/repo. Include reproduction steps and acceptance criteria."
```

The feature, bug-fix and security teams persist steps in SQLite, pass completed outputs forward and include independent verification. They may run commands, edit files and create pull requests. Run against a working branch with appropriate permissions. The dashboard's readiness means configuration and workflow files were detected; it does not verify gateway connectivity or model health.

## Antseed model supply

Use the [Antseed guide](antseed.md) for the pinned CLI helper, isolated zero-token-price configuration, model discovery and OpenClaw provider snippet. Antseed is a model supply route, not a replacement for the workflow engine. Free sellers and reliable tool use are not guaranteed.

## Ollama

OpenClaw supports [Ollama configuration](https://docs.openclaw.ai/providers/ollama). Local inference can avoid per-token provider charges but needs suitable hardware and a model with tool calling. Check the model's actual context limits and test a small workflow. Colony does not install Ollama or model weights automatically.

## OpenCode activity ants

Copy the observer plugin into the repository where OpenCode runs:

```sh
mkdir -p /path/to/project/.opencode/plugins
cp integrations/opencode/antfarm-colony.js /path/to/project/.opencode/plugins/
```

Restart OpenCode. Start Colony with `npm start`; set `ANTFARM_COLONY_URL=http://127.0.0.1:YOUR_PORT` for OpenCode if Colony uses a custom port. The plugin accepts loopback HTTP destinations only and sends bounded status metadata. It omits prompts, tool arguments, outputs and source contents.

Each OpenCode session appears as an ant, with activity mapped to scout, builder, verifier or planner roles. Permission waits show blocked; idle sessions show idle; stale sessions become idle after 15 minutes. Control those sessions in OpenCode. They do not create Colony workflow tasks, results or achievements.

See [plugin installation and event details](../integrations/opencode/README.md), [official plugin docs](https://opencode.ai/docs/plugins/) and [OpenCode source](https://github.com/anomalyco/opencode). Real OpenCode end-to-end execution was not verified here; plugin hooks and metadata were tested against fixtures.

## Other researched runtimes

[OpenHands](https://github.com/OpenHands/OpenHands), its [Software Agent SDK](https://github.com/OpenHands/software-agent-sdk), and [OpenJarvis](https://github.com/open-jarvis/OpenJarvis) are research references. There are no bundled adapters for these runtimes. No relevant UltronOS agent runtime was verified. Do not interpret a research link as a working integration.
