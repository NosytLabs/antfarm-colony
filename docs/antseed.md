# Antseed for Colony

Antseed supplies a local API proxy backed by peer-to-peer model providers. Colony's helper installs the CLI, creates isolated settings, checks discovered text models, and prints an OpenClaw provider entry. OpenClaw executes the workflow agents; Antseed supplies inference when correctly connected.

Antseed does **not** guarantee free models. Sellers can offer zero prices and impose quotas. Paid services settle in USDC. Colony's helper uses zero input, output and cached-token price caps; it never funds a wallet. If no suitable zero-price seller exists, choose another provider or a local model.

## Install and start

Requires Colony's Node 24 environment and a completed `npm run build`.

```sh
npm run antseed -- install
npm run antseed -- setup
npm run antseed -- start
```

The install pins **@antseed/cli 0.1.168** in the colony state directory, not globally. Setup creates `ANTFARM_HOME/antseed/config.json` and refuses to overwrite it. Without `ANTFARM_HOME`, this is inside the default colony state directory `~/.openclaw/antfarm-colony`. Antseed identities, databases and buyer state remain there; do not commit or export them.

The starter proxy uses `127.0.0.1:8377`. Choose another port at initial setup with `npm run antseed -- setup --port 8380`. Start runs in the foreground; keep that terminal open and use Ctrl+C to stop it. It refuses an occupied port so an existing paid proxy is not silently reused. It also rejects modified price defaults or service/provider overrides that would bypass zero token caps.

## Discover a model

In a second terminal:

```sh
npm run antseed -- check
npm run antseed -- models
npm run antseed -- models --json
```

Or open **Connect → Check local proxy & models** in the dashboard. These checks issue a local model-list GET request only. They do not send prompts, generate images, perform inference or fund a wallet.

The list marks **zero-token offers**, not guaranteed free execution. It excludes non-text models and does not label missing prices as zero. Tool support is shown when the catalog reports it. The running proxy's policy, seller health, trust threshold, quotas and model capabilities still determine whether a request succeeds. Token caps are not a general budget for image or other unit-billed services; this connector is for text workers.

## Connect OpenClaw workers

Choose a discovered model with appropriate tool calling and context limits:

```sh
npm run antseed -- config --model "YOUR_MODEL_ID"
```

This prints a provider **merge snippet**; it does not change OpenClaw. Merge its `models.providers.antseed` entry into your selected OpenClaw configuration, preserving other providers and agents. Defaults are conservative declarations, not measured model limits. Override them with `--context 32768 --max-tokens 4096` as appropriate for that model.

Then select the model and restart OpenClaw:

```sh
openclaw models set "antseed/YOUR_MODEL_ID"
openclaw gateway restart
npm run cli -- workflow install feature-dev
```

Installation provisions workflow agents and changes the selected OpenClaw configuration. In Colony's live mission dialog, choose the installed team and provide a repository path, acceptance criteria and a bounded task. The bundled workflows use the configured default model unless their YAML explicitly overrides it.

Before a substantial mission, validate tool calling with a small task in a disposable working branch. Model listing alone does not prove inference works. Workflow tools may edit source, run commands and create pull requests according to your runtime permissions.

## OpenCode and local models

The upstream Antseed CLI offers an `antseed opencode --model ID` wrapper. For Colony's isolated CLI, its executable is under the state directory; use the [OpenCode integration guide](integrations.md) for provider configuration and the telemetry plugin. Antseed's standalone defaults and data directory can differ from Colony's zero-price helper, so do not assume a separately launched proxy uses the same limits.

[Ollama](https://docs.ollama.com/) is an alternative for local inference without per-token provider fees. Hardware and reliable tool support matter. Configure it in OpenClaw separately; Colony does not download models or silently switch providers.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| CLI missing | Run `npm run antseed -- install` after building Colony |
| Setup already exists | Inspect the existing isolated config; setup never overwrites it |
| Port occupied | Stop that proxy or initialize a separate colony state directory/port |
| Discovery timed out | Check the buyer terminal and retry after peer discovery; an empty or timed-out catalog is not a successful connection |
| No zero-token offers | No free seller is guaranteed; keep the caps or choose a local provider |
| Model cannot use tools | Choose a tool-capable model and verify it before dispatching a code workflow |
| Modified paid caps rejected | The helper is intentionally zero-token-price; manage deliberately paid use through the standalone Antseed CLI |
| Workers remain queued | Confirm the gateway, installed workflow, cron workers, chosen model and tool permissions |

## Validation and sources

Observed 2026-10-03: the pinned CLI installed, its actual configuration loaded zero caps, and a buyer started locally. Catalog requests timed out in this environment; end-to-end inference remains unverified. No funding or paid requests were made. See [validation](validation.md).

Primary sources: [Antseed source](https://github.com/Antseed/antseed), [CLI reference](https://github.com/Antseed/antseed/tree/main/apps/cli), [using the API](https://antseed.com/docs/guides/using-api/), [pricing](https://antseed.com/docs/pricing/), [OpenClaw integration](https://antseed.com/integrations/openclaw/), and [OpenClaw model providers](https://docs.openclaw.ai/concepts/model-providers).
