# Changelog

## 0.1.1 — Reliable colony movement

- Recovered the original Colony checkpoint and Git history into `NosytLabs/antfarm-colony`.
- Keep ants inside their tunnel route when a mission changes while they travel.
- Update chamber locations immediately in reduced-motion mode, including when enabled during travel.
- Select the frontmost worker when ants overlap.
- Exclude common generated files, caches and virtual environments from repository surveys and report skipped-directory counts.
- Verify all 32 ant frames and 24 props in the browser, plus shared walking/working frame dimensions.
- Update the YAML parser to a patched release and run verification on pushes to main.

## 0.1.0 — Antfarm Colony

- New six-chamber ant colony interface, original sprite atlas and props.
- Real local repository surveys and normalized workflow state.
- Live/demo separation, run inspection, settings, growth milestones, and fading handoff trails.
- Isolated state paths, constrained local HTTP endpoints, and browser verification.
- Retained MIT upstream workflow engine and its regression tests; archived upstream documentation.
- Added isolated Antseed CLI installation, zero-token-price configuration, read-only model discovery and OpenClaw provider snippets.
- Added first-run checklist, persisted workspace/port setup, and OpenCode telemetry with bounded storage.
- Added 16 working animation frames and eight growth structures, tied to completed steps.
- Fixed live/demo banner visibility, delayed inspector responses, mobile toast overlap, unavailable-storage settings and offline setup diagnostics.
- Unified dashboard port settings across foreground and daemon entry points.
