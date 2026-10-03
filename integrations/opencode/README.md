# OpenCode ants

This local plugin turns real OpenCode sessions into observed ants in a running Antfarm Colony. It does not dispatch OpenCode from the dashboard, replace its permission controls, or manufacture completed tasks. Use the OpenClaw workflow teams for coordinated mission execution.

Start Antfarm with `npm start`. In the project where you use OpenCode, create `.opencode/plugins/` and copy `antfarm-colony.js` there. Restart OpenCode. Local JavaScript plugins load at startup; no additional package is required. Set `ANTFARM_COLONY_URL=http://127.0.0.1:8114` when using a different local port.

Tool hooks report running activity. Permission requests appear blocked; errors appear failed; idle sessions return to the nursery. Tool names select the scout, builder, planner, or verifier appearance. The dashboard also marks a session idle after fifteen minutes without telemetry. An open idle process is not proof of active model work.

Only source, session ID, event ID, status, role, generated display name, and tool name are sent. Prompts, tool arguments, outputs, filenames, and source code are not included. Telemetry is restricted to loopback, has a bounded queue and short timeout, and does not block tool execution when the dashboard is unavailable. Missed observations are not replayed as completed work.

Server endpoint: `POST /api/bridge/events`. Event storage is limited to 100 sessions and 500 events. Workflow tasks and achievements remain separate. See [official OpenCode plugin documentation](https://opencode.ai/docs/plugins/) and [hook types](https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts). Hook behavior is tested with fixtures; live execution requires your OpenCode installation.
