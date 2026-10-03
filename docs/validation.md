# Validation record — 2026-10-03

Environment: Node 24.19.0, npm 11.9.0, Linux; Playwright 1.62.1 with the available Chromium executable. Tests use temporary workspaces and state. Agent Office remains unchanged at `35cf7fbdd06e56dc5fde5cdd228d5ff212ac0a1d`.

## Automated verification

- `npm test`: **179 tests passed**, 37 suites, zero failures.
- `npm run test:browser`: **36 browser checks passed**, zero page errors.
- TypeScript build passed; browser modules parsed successfully.
- Real SQLite-backed repository survey: inventory, quality scan and summary persist across reload. A fixture TODO is reported, sensitive files and dependency directories are excluded, and symlinks are skipped.
- HTTP host/origin validation, request limits, disabled unconfigured AI dispatch, OpenCode telemetry validation, retention limits and stale-session handling are covered.
- Antseed integration tests use a local HTTP fixture: zero and paid token rates, unknown pricing, cached-token charges, non-text models, invalid JSON and redirects. They send model-list GET requests only.
- Dashboard port resolution is shared by foreground and daemon entry points; saved, environment and explicit overrides are checked, and an already-running daemon reports its actual port.

## Browser flows

Live/demo separation, late live-poll isolation, truthful banner visibility, first-run checklist, offline readiness, setup dismissal, real survey dispatch, result/timeline inspection, late-inspector response isolation, guarded unconfigured AI dispatch, model selection/config commands, settings persistence, storage-denied fallback, keyboard tabs, zoom, animation advancement/pause, export labeling, seven milestones, four workflow cards, mobile dialogs, toast/navigation separation and desktop/mobile overflow.

Screenshots in `screenshots/` cover desktop demo, live survey, mobile colony and desktop/mobile connection guides. The demo screenshot is illustrative; the live screenshot shows actual local survey output.

## Asset inspection

32 ant frames (16 walking + 16 working), 16 original props and 8 growth objects have measured alpha bounds. Frame extraction retains the largest connected component; shared role scale and bottom-center anchors prevent gutter fragments and baseline drift. New growth-sheet components were counted and inspected in the game. Canvas drawing targets approximately 60 Hz, with animation frozen for pause/reduced motion and limited in hidden tabs. This is not a cross-device performance certification.

## External integration limits

The pinned `@antseed/cli@0.1.168` installed successfully in isolated temporary state. Its version, buyer-start flags and actual loaded configuration were verified; input/output/cached token caps were zero. A real buyer started on loopback port 8377 with isolated identity/state. Its model catalog timed out at both 3 and 15 seconds in this environment. The buyer was stopped. No inference, wallet funding or paid transaction was performed. The UI reports a discovery timeout and allows retry; it does not claim a model is working merely because configuration exists.

OpenClaw-backed model execution, a real OpenCode session and provider tool compatibility require the user's configured services. Local tests and a successful CLI launch do not verify these. Antseed sellers may advertise zero prices, but availability, trust policy, quotas and capabilities still determine whether a task can run. OpenClaw workflow installation is an explicit step and can modify its configuration. GitHub publication requires repository creation through an authenticated account; no remote publication is claimed by this record.

## Boundaries

This release is a local workflow dashboard and visualization, not a fully decentralized scheduler. The repository survey is deterministic and does not use an LLM. OpenCode ants reflect external activity; they do not fabricate task completion. Pheromone trails visualize completed dependency handoffs; they do not choose a task's model or next worker.
