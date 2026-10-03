import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { resolveAntfarmRoot, resolveOpenClawConfigPath, resolveWorkflowRoot } from '../dist/installer/paths.js';
import { dashboardConfigPath, readDashboardConfig } from '../dist/server/config.js';

const workflows = ['feature-dev', 'bug-fix', 'security-audit'];
let existing;
try { existing = readDashboardConfig(); } catch { existing = {version:1}; }
const diagnostics = () => ({
  node: process.versions.node,
  workspace: process.env.ANTFARM_WORKSPACE || existing.workspace || process.cwd(),
  port: Number(process.env.PORT || existing.port || 8114),
  stateDirectory: resolveAntfarmRoot(),
  openclawConfigured: fs.existsSync(resolveOpenClawConfigPath()),
  installedWorkflows: workflows.filter(id => fs.existsSync(path.join(resolveWorkflowRoot(), id, 'workflow.yml'))),
});
if (process.argv.includes('--check')) {
  console.log(JSON.stringify(diagnostics(), null, 2));
} else if (!process.stdin.isTTY) {
  console.log('Use npm run setup in an interactive terminal, or npm run setup -- --check for diagnostics.');
  process.exitCode = 1;
} else {
  const prompt = createInterface({input:process.stdin,output:process.stdout});
  try {
    console.log('\nANTFARM COLONY · First colony setup\n');
    console.log('Choose a repository for local surveys. AI workflow installation is a separate explicit step.');
    const choice = (await prompt.question(`Repository directory [${diagnostics().workspace}]: `)).trim();
    const workspace = fs.realpathSync(path.resolve(choice || diagnostics().workspace));
    if (!fs.statSync(workspace).isDirectory()) throw new Error('Choose a directory, not a file.');
    const port = Number((await prompt.question(`Local port [${diagnostics().port}]: `)).trim() || diagnostics().port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer from 1 to 65535.');
    const file = dashboardConfigPath();
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,JSON.stringify({version:1,workspace,port},null,2)+'\n',{mode:0o600});
    existing = {version:1,workspace,port};
    console.log(`\nColony configured. Start with npm start, then open http://127.0.0.1:${port}.`);
    console.log('Your first repository survey needs no AI provider. Choose it in the dashboard.');
    console.log('\nFor AI teams: configure OpenClaw and a tool-capable model, then run:');
    console.log('  npm run cli -- workflow install feature-dev');
    console.log('Installation provisions workers and updates your chosen OpenClaw configuration.');
    console.log('Optional Antseed: npm run antseed -- install, then npm run antseed -- setup and npm run antseed -- start.');
    console.log('Colony caps Antseed token prices at zero; free seller availability and quotas vary. Local Ollama is another option.');
    console.log('Read docs/integrations.md and docs/antseed.md before connecting a provider.');
    console.log('For OpenCode visualization, copy integrations/opencode/antfarm-colony.js into your project .opencode/plugins/.');
    console.log('\nRun npm run setup -- --check whenever you need a readiness report.');
  } catch(error) { console.error(`Setup: ${error.message}`); process.exitCode=1; }
  finally { prompt.close(); }
}
