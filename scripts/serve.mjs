import { startDashboard } from '../dist/server/dashboard.js';
import { shutdownHarnesses } from '../dist/server/harness.js';
import { resolveDashboardPort } from '../dist/server/config.js';
const port = resolveDashboardPort();
const server = startDashboard(port);
server.on('error', (error) => { console.error('Could not start Antfarm Colony:', error.message); process.exitCode = 1; });
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await shutdownHarnesses();server.close(()=>process.exit(0));});
