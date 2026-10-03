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
