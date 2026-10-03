# Runtime and editor integrations

Colony displays state from its workflow engine and optional editor telemetry. A repository survey works without an AI provider. AI workers require a configured execution runtime and a model capable of the assigned tools.

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
