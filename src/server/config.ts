import fs from 'node:fs';
import path from 'node:path';
import { resolveAntfarmRoot } from '../installer/paths.js';
export interface DashboardConfig { version: 1; workspace?: string; port?: number }
export function dashboardConfigPath(): string { return path.join(resolveAntfarmRoot(), 'dashboard.json'); }
export function resolveDashboardPort(explicit?: number): number {
  const port = explicit ?? Number(process.env.PORT || readDashboardConfig().port || 8114);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Dashboard port must be an integer from 1 to 65535.');
  return port;
}
export function readDashboardConfig(): DashboardConfig {
  const file = dashboardConfigPath();
  if (!fs.existsSync(file)) return { version: 1 };
  let data: DashboardConfig;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error(`Invalid dashboard settings in ${file}. Run npm run setup to repair them.`); }
  if (!data || data.version !== 1 || (data.workspace !== undefined && (typeof data.workspace !== 'string' || !path.isAbsolute(data.workspace))) || (data.port !== undefined && (!Number.isInteger(data.port) || data.port < 1 || data.port > 65535))) throw new Error(`Unsupported dashboard settings in ${file}`);
  return data;
}
