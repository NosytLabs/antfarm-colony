import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { ANTSEED_VERSION, antseedPaths, initializeAntseed, antseedStartArgs, inspectAntseed, openclawAntseedConfig } from '../dist/integrations/antseed.js';

const [command='help',...args]=process.argv.slice(2);
const files=antseedPaths();
const option=(name,fallback)=>{const i=args.indexOf(name);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing value for ${name}`);return args[i+1];};
function run(binary,parameters,options={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,parameters,{stdio:'inherit',...options});
    const interrupt=()=>child.kill('SIGINT'),terminate=()=>child.kill('SIGTERM');
    process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
    const cleanup=()=>{process.off('SIGINT',interrupt);process.off('SIGTERM',terminate);};
    child.once('error',error=>{cleanup();reject(error);});
    child.once('exit',(code)=>{cleanup();resolve(code??1);});
  });
}
try {
  if(command==='install') {
    fs.mkdirSync(files.tools,{recursive:true,mode:0o700});
    console.log(`Installing @antseed/cli@${ANTSEED_VERSION} in ${files.tools}. No global installation.`);
    process.exitCode=await run(process.platform==='win32'?'npm.cmd':'npm',['install','--prefix',files.tools,'--save-exact',`@antseed/cli@${ANTSEED_VERSION}`]);
  } else if(command==='setup') {
    initializeAntseed(Number(option('--port','8377')));
    console.log(`Created ${files.config} with zero input/output/cached token price caps.\nNo wallet funding or provider requests were made.\nNext: npm run antseed -- start (keep this terminal open), then npm run antseed -- models.`);
  } else if(command==='start') {
    const parameters=antseedStartArgs();
    if(!fs.existsSync(files.cli))throw new Error('Run npm run antseed -- install first.');
    const port=Number(parameters[parameters.indexOf('--port')+1]);
    // Antseed can reuse a running proxy; reject an occupied port so a paid proxy isn't silently reused.
    await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',()=>reject(new Error(`Port ${port} is occupied. Stop that proxy or choose a different colony Antseed port.`)));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
    console.log('Starting the isolated buyer with zero token caps. Free sellers are not guaranteed. Ctrl+C stops this process.');
    process.exitCode=await run(process.execPath,[files.cli,...parameters],{cwd:files.root,env:{...process.env,ANTSEED_DATA_DIR:files.root}});
  } else if(command==='check'||command==='models') {
    const status=await inspectAntseed();
    if(args.includes('--json')||command==='check')console.log(JSON.stringify(status,null,2));
    else {console.log(status.message);console.table(status.models.map(model=>({model:model.id,zeroTokenOffer:model.zeroTokenPrice,toolUse:model.toolUse??'unknown',offers:model.offers})));}
    if(!status.connected)process.exitCode=1;
  } else if(command==='config') {
    const model=option('--model','');
    const snippet=openclawAntseedConfig(model,Number(option('--context','32768')),Number(option('--max-tokens','4096')));
    console.log(JSON.stringify(snippet,null,2));
    const quoted="'"+('antseed/'+model).replaceAll("'","'\\''")+"'";
    console.error(`Merge this provider entry into OpenClaw configuration, preserving existing keys. Verify model context/tool support.\nThen: openclaw models set ${quoted}\nRestart your OpenClaw gateway and install a Colony workflow. This command did not edit OpenClaw.`);
  } else if(command==='help') {
    console.log('Colony Antseed connector\n  install                  Install pinned CLI in colony state\n  setup [--port 8377]       Create isolated zero-token-price config\n  start                    Run buyer in foreground with zero token caps\n  check                    Read-only diagnostics as JSON\n  models [--json]           List discovered text models and zero-token offers\n  config --model ID        Print OpenClaw provider merge snippet\n         [--context 32768] [--max-tokens 4096]\n\nNo automatic funding. Seller quotas, trust and availability apply. See docs/antseed.md.');
  } else throw new Error(`Unknown command ${command}. Run npm run antseed -- help.`);
} catch(error) {console.error(`Antseed: ${error.message}`);process.exitCode=1;}
