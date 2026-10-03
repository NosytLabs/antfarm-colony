# Validation record — 2026-10-03

Version 0.2.0 environment: macOS, Node 26.10.0, npm 12.1.0, Playwright 1.62.1 with local Chrome. Tests use temporary workspaces and state. The original 0.1.0 cloud checkpoint used Node 24.19.0 on Linux. CI verifies Node 24 on Ubuntu. Agent Office was not modified by this work.

The 0.1.0 archive was recovered from the original chat and its SHA-256 verified as `b6c38b76ddc6cff2da390c5d99fd87ab2da96372b11a6dc0d710a9619cb6b6d0`. All 189 archive payload files matched the manifest. Its original source commit `a10ab565eca11abbbf9ba2bbe57c78045b0abf91` is preserved in this repository's history.

## Automated verification

- `npm test`: **200 tests passed**, 37 suites, zero failures.
- `npm run test:browser`: **45 browser checks passed**, zero page errors.
- Direct engine tests reproduce and cover verify-each handoffs, consistent poll/claim readiness and rejection of late cancellation responses.
- Real child-process tests cover literal prompt arguments, persisted stdout, sequential CLI handoffs, nonzero exit failure, resume without replaying completed steps, process cancellation, capacity limits and restart recovery. Native model inference is not exercised by these fixtures.
- Demo tests cover final completion, cancellation without resurrection and complete upstream step catalogs.
- Regression tests reproduce and cover mid-tunnel task changes, reduced-motion location updates, and selecting overlapping ants in paint order.
- All 32 ant frames and 24 prop/structure frames contain visible artwork after extraction. Walking and working frames share stable dimensions for each role.
- The patched YAML dependency has no known advisories in the current npm audit.
- TypeScript build passed; browser modules parsed successfully.
- Real SQLite-backed repository survey: inventory, quality scan and summary persist across reload. A fixture TODO is reported, sensitive files, dependency/build/cache directories and virtual environments are excluded, and symlinks are skipped. The recovered repository was also surveyed locally through all three steps.
- HTTP host/origin validation, request limits, disabled unconfigured AI dispatch, OpenCode telemetry validation, retention limits and stale-session handling are covered.
- Antseed integration tests use a local HTTP fixture: zero and paid token rates, unknown pricing, cached-token charges, non-text models, invalid JSON and redirects. They send model-list GET requests only.
- Dashboard port resolution is shared by foreground and daemon entry points; saved, environment and explicit overrides are checked, and an already-running daemon reports its actual port.

## Browser flows

Live/demo separation, late live-poll isolation, truthful banner visibility, first-run checklist, offline readiness, setup dismissal, real survey dispatch, result/timeline inspection, late-inspector response isolation, guarded unconfigured AI dispatch, model selection/config commands, CLI runtime selection/dispatch, streaming output refresh, Back/Forward/home navigation, mobile inspector layout, settings persistence, storage-denied fallback, keyboard tabs, zoom, animation advancement/pause, export labeling, seven milestones, six workflow cards, mobile dialogs, toast/navigation separation and desktop/mobile overflow.

Screenshots in `screenshots/` cover desktop demo, live survey, mobile colony and desktop/mobile connection guides and side inspectors. The demo screenshot is illustrative; the live screenshot shows actual local survey output.

## Asset inspection

32 ant frames (16 walking + 16 working), 16 original props and 8 growth objects have measured alpha bounds. Frame extraction retains the largest connected component; shared role scale and bottom-center anchors prevent gutter fragments and baseline drift. New growth-sheet components were counted and inspected in the game. Canvas drawing targets approximately 60 Hz, with animation frozen for pause/reduced motion and limited in hidden tabs. This is not a cross-device performance certification.

## External integration limits

The pinned `@antseed/cli@0.1.168` installed successfully in isolated temporary state. Its version, buyer-start flags and actual loaded configuration were verified; input/output/cached token caps were zero. A real buyer started on loopback port 8377 with isolated identity/state. Its model catalog timed out at both 3 and 15 seconds in this environment. The buyer was stopped. No inference, wallet funding or paid transaction was performed. The UI reports a discovery timeout and allows retry; it does not claim a model is working merely because configuration exists.

OpenClaw-backed model execution, authenticated OpenCode/Hermes model sessions and provider tool compatibility require the user's configured services. Local process tests and installed CLI help checks do not verify these. OpenCode and Hermes are both installed on the validation host; their exact runner flags were confirmed without a model call. Antseed sellers may advertise zero prices, but availability, trust policy, quotas and capabilities still determine whether a task can run. OpenClaw workflow installation is an explicit step and can modify its configuration. The Antseed launch described above belongs to the original cloud validation; this continuation verified the connector with local fixtures.

## Boundaries

This release is a local workflow dashboard and visualization, not a fully decentralized scheduler. The repository survey is deterministic and does not use an LLM. Observer ants reflect external activity; CLI-dispatched ants reflect actual child-process state. Neither fabricates model output. Pheromone trails visualize completed dependency handoffs; they do not choose a task's model or next worker.
