# Design and agent-system research

Reviewed 2026-10-03. Antfarm Colony is a new project. Agent Office is preserved unchanged; referenced projects are inspiration or explicitly attributed upstream code.

| Reference | Useful pattern | Applied in Colony |
| --- | --- | --- |
| [snarktank/antfarm](https://github.com/snarktank/antfarm) v0.5.1 | Durable YAML teams, SQLite steps, verifier gates and OpenClaw workers | MIT engine retained and adapted; upstream docs archived |
| [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) | Animated characters reflect real agent activity and lifecycle | State-driven ant roles, inspector and external OpenCode telemetry |
| [The Pixel Office](https://thepixeloffice.ai/) | Spatial view makes simultaneous work understandable | Colony chambers, concise HUD and visible handoffs; marketing screenshot reviewed |
| [Agent Office](https://github.com/harishkotra/agent-office) | Pixel workspace visualization | Independent colony interface and artwork; original checkout unchanged |
| [Antseed](https://github.com/Antseed/antseed) | Local buyer proxy routes inference through discovered providers | Pinned CLI helper, zero token caps, discovery and OpenClaw provider snippet |
| [OpenHands](https://github.com/OpenHands/OpenHands) / [SDK](https://github.com/OpenHands/software-agent-sdk) | Execution runtime and reusable agent SDK are distinct layers | Architectural reference only; no adapter bundled |
| [OpenJarvis](https://github.com/open-jarvis/OpenJarvis) | Local/personal AI architecture | Research only; no runtime integration |

The name UltronOS is ambiguous. The identifiable [aswinmohanme/ultronOS](https://github.com/aswinmohanme/ultronOS) is an operating-system project, not an established agent runtime for this integration. No Ultron functionality is claimed.

## Colony principles

Ant task allocation emerges from local interactions and the shared environment. Stigmergy describes coordination through changes left in that environment. The queen is primarily reproductive; she is not a manager assigning workers their tasks. Colony's queen chamber is an interface metaphor for planning and overview.

The implementation borrows the idea of visible environmental traces: successful dependency handoffs leave trails, and the trails fade over time. Persisted outputs let asynchronous workers continue a goal through explicit steps. Specialized scouts, planners, builders and verifiers make responsibility and review visible.

These are design analogies. The current scheduler uses a central SQLite ledger and OpenClaw workers. It is not a distributed swarm and does not implement Ant Colony Optimization. Visual trail strength does not select models, claim work or replace the declared workflow. The local repository survey is deterministic; it is not represented as an LLM completing a task.

Primary foundations: Theraulaz and Bonabeau, [A Brief History of Stigmergy](https://doi.org/10.1162/106454699568700), 1999; Dorigo, Maniezzo and Colorni, [Ant System: Optimization by a Colony of Cooperating Agents](https://doi.org/10.1109/3477.484436), 1996; [Deborah Gordon's research](https://web.stanford.edu/~dmgordon/) on ant collective behavior and task allocation.

## Visual decisions

The office reference uses crowded isometric rooms. Colony instead uses a side-view underground cutaway with six clear chambers, connected tunnels and an open floor for moving ants. Objects use natural materials: moss, leaves, roots, seeds, fungi and amber. Generated sprites are isolated by measured alpha bounds and share role anchors; working and walking use separate four-frame sequences.

UI controls remain in the DOM around the canvas. Roster items and room labels offer inspection without precise sprite clicking. First-run setup can be dismissed and reopened. Live/demo labels, local connection diagnostics and actual task results make simulated and executed activity distinguishable. Growth rewards depend on completed tasks and show matching new structures in the scene.

## Integration evidence

Context7 was used for current OpenCode plugin and Node documentation. Antseed was not resolved to an appropriate Context7 library, so its official source and documentation were used. GitHub supplied repository sources; Firecrawl supplied the Pixel Office design screenshot. No third-party office art is bundled. Generated artwork and its available prompt records are documented in [assets](../web/assets/README.md) and [asset prompts](asset-prompts.md).

See [validation](validation.md) for tested behavior and external execution limits. A working dashboard or model-list fixture is not proof of successful provider inference.


## 2026-10-03 continuation: teams, harnesses and habitat

Primary sources were retrieved using GitHub, Context7 and Firecrawl. No reference-project artwork or new code was copied; the existing MIT Antfarm engine remains the foundation.

| Source | Evidence and implementation decision |
| --- | --- |
| [snarktank/antfarm README](https://github.com/snarktank/antfarm) and [workflow authoring](https://github.com/snarktank/antfarm/blob/main/docs/creating-workflows.md) | Preserve all 7 feature, 6 bug-fix and 7 security pipeline steps. Bring ordered handoffs, separate verification, expected-output gates and retry visibility into CLI teams and the inspector. Show existing story acceptance criteria. |
| [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) | Its provider-normalized events, agent state machines and session/team identity motivate runtime-scoped observations and stable ant identity. Hooks are distinct from execution; our observer and dispatcher remain explicit separate paths. |
| [AgentOffice](https://github.com/harishkotra/agent-office) | Its task board, activity feed, agent inspector and walk-to-work behavior motivate mission grouping, a persistent details panel and individual chamber work spots. We did not import its autonomous hiring loop or inference stack. |
| [The Pixel Office](https://thepixeloffice.ai/) | Firecrawl retrieved the landing-page content and a screenshot. This is a visual/product reference; its marketing claims are not evidence that our integrations work. |
| [OpenCode run source](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/cli/cmd/run.ts) | Noninteractive run, JSON event output, current tool names and explicit errors. Local `opencode run --help` confirmed supported flags. |
| [Hermes CLI reference](https://github.com/nousresearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md) | Query mode, stream-json event schema and meaningful exit codes. Local `hermes chat --help` confirmed the dispatch flags. |
| [ASU Ask A Biologist: leafcutter castes](https://askabiologist.asu.edu/leafcutter-castes) | Specialist workers, fungus tending, brood care and excavated chambers informed differentiated rooms and work props. The queen-as-planner is a visual metaphor: real ant queens are reproductive specialists, not project managers. |

The habitat stays readable as a game: clear floors and connected routes, separate food/fungus/brood areas, and work represented by actual recorded task state. Pheromones illustrate completed handoffs. We do not claim biological fidelity or decentralized swarm intelligence. Native model credentials and provider availability remain outside the renderer.


A GitHub comparison of v0.5.1 to main found four commits ending at `a442ad7dcb8cf8746175cc4a2e2dcafd501156cf`. The recovered source already included their substantive engine changes. We preserved those and tested real `claimStep`, `completeStep` and `failStep` calls against temporary SQLite state. This revealed an exception missing from sequential gating: a verify-each step must be able to claim while its parent loop remains running after a story handoff. Polling now shares the same readiness rule, and late responses cannot alter cancelled/completed runs. See `tests/colony-engine-handoffs.test.mjs` and `UPSTREAM.md`.
