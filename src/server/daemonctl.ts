import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveAntfarmRoot } from "../installer/paths.js";
import { resolveDashboardPort } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getPidFile(): string {
  return path.join(resolveAntfarmRoot(), "dashboard.pid");
}

export function getLogFile(): string {
  return path.join(resolveAntfarmRoot(), "dashboard.log");
}
function activePort(pid:number): number|undefined {
  try {
    const data=JSON.parse(fs.readFileSync(path.join(resolveAntfarmRoot(),'dashboard.runtime.json'),'utf8'));
    if(data.pid===pid && Number.isInteger(data.port) && data.port>0 && data.port<=65535) return data.port;
  } catch {}
  return undefined;
}

export function isRunning(): { running: true; pid: number } | { running: false } {
  const pidFile = getPidFile();
  if (!fs.existsSync(pidFile)) return { running: false };
  const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
  if (isNaN(pid)) return { running: false };
  try {
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    // Stale PID file
    try { fs.unlinkSync(pidFile); } catch {}
    return { running: false };
  }
}

export async function startDaemon(port = resolveDashboardPort()): Promise<{ pid: number; port: number }> {
  port = resolveDashboardPort(port);
  const status = isRunning();
  if (status.running) {
    const actualPort=activePort(status.pid);
    if(actualPort===undefined)throw new Error('Dashboard is running but its active port is unknown. Stop it before starting another dashboard.');
    return { pid: status.pid, port:actualPort };
  }

  const logFile = getLogFile();
  const pidDir = path.dirname(getPidFile());
  fs.mkdirSync(pidDir, { recursive: true });

  const out = fs.openSync(logFile, "a");
  const err = fs.openSync(logFile, "a");

  const daemonScript = path.resolve(__dirname, "daemon.js");
  const child = spawn(process.execPath, [daemonScript, String(port)], {
    detached: true,
    stdio: ["ignore", out, err],
  });
  fs.closeSync(out);
  fs.closeSync(err);
  child.unref();

  // Wait 1s then confirm
  await new Promise((r) => setTimeout(r, 1000));

  const check = isRunning();
  if (!check.running || check.pid!==child.pid || activePort(check.pid)===undefined) {
    throw new Error("Daemon failed to start. Check " + logFile);
  }
  return { pid: check.pid, port:activePort(check.pid)! };
}

export function stopDaemon(): boolean {
  const status = isRunning();
  if (!status.running) return false;
  try {
    process.kill(status.pid, "SIGTERM");
  } catch {}
  try { fs.unlinkSync(getPidFile()); } catch {}
  return true;
}

export function getDaemonStatus(): { running: boolean; pid?: number; port?: number } | null {
  const status = isRunning();
  if (!status.running) return { running: false };
  return { running: true, pid: status.pid, port:activePort(status.pid) };
}
