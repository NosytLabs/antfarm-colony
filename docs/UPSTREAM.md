# Provenance

Antfarm Colony starts a new repository and preserves Agent Office unchanged.

The workflow CLI, installer, SQLite scheduler, medic, agents, YAML workflows, and engine tests originate from [snarktank/antfarm](https://github.com/snarktank/antfarm), release v0.5.1. Its MIT copyright is retained in LICENSE.upstream. The original README and changelog are archived in docs/upstream for historical reference; their installation instructions, support promises, and version numbers do not describe this project.

The colony dashboard, renderer, generated artwork, local survey, HTTP hardening, and state isolation are additions. Agent Office and Pixel Agents informed the visualization approach but their office art is not bundled. See research.md for distinctions and sources.


## Upstream comparison for 0.2.0

Compared with upstream main `a442ad7dcb8cf8746175cc4a2e2dcafd501156cf` on 2026-10-03. Although the recovered archive described its base as v0.5.1, it already contained the later scoped-uninstall, configured-model resolution, run-gating/template-validation and medic JSON changes. Byte-level Git blob comparison confirmed matching `uninstall.ts`, `agent-cron.ts`, `openclaw-config.ts`, `medic-cron.ts`, and both changed workflow YAMLs. Local gateway/CLI/state-path adaptations were preserved.

The full upstream pipelines are now also used in Demo. New direct-engine regression tests exposed and fixed a verify-each gating deadlock, polling of unclaimable work, and late completion/failure updates after cancellation. No duplicate upstream import was needed; research details and commit comparison are recorded in `research.md`.
