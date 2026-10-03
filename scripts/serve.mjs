import { startDashboard } from '../dist/server/dashboard.js';
import { resolveDashboardPort } from '../dist/server/config.js';
const port = resolveDashboardPort();
const server = startDashboard(port);
server.on('error', (error) => { console.error('Could not start Antfarm Colony:', error.message); process.exitCode = 1; });
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>server.close(()=>process.exit(0)));
