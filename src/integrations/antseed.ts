import fs from 'node:fs';
import path from 'node:path';
import { resolveAntfarmRoot } from '../installer/paths.js';

// Verified against the published CLI and official source on 2026-10-03.
export const ANTSEED_VERSION = '0.1.168';
export function antseedPaths() {
  const root = path.join(resolveAntfarmRoot(), 'antseed');
  const tools = path.join(root, 'tools');
  return { root, tools, config:path.join(root,'config.json'), cli:path.join(tools,'node_modules/@antseed/cli/dist/cli/index.js') };
}

function validPort(port: unknown): port is number { return Number.isInteger(port) && Number(port) > 0 && Number(port) <= 65535; }
export function initializeAntseed(port = 8377) {
  if (!validPort(port)) throw new Error('Antseed port must be an integer from 1 to 65535.');
  const files = antseedPaths();
  fs.mkdirSync(files.root,{recursive:true,mode:0o700});
  const config = { buyer:{ proxyPort:port, maxPricing:{defaults:{inputUsdPerMillion:0,outputUsdPerMillion:0,cachedInputUsdPerMillion:0}}, routingPreferences:{preferFreePeers:true,maxInputUsdPerMillion:0,minTrustScore:60} } };
  try { fs.writeFileSync(files.config,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600}); }
  catch(error) { if ((error as NodeJS.ErrnoException).code==='EEXIST') throw new Error(`Antseed config already exists at ${files.config}; it was not overwritten.`); throw error; }
  return files;
}

function readSettings(): { port:number; configured:boolean; zeroTokenCaps:boolean } {
  const file = antseedPaths().config;
  if (!fs.existsSync(file)) return {port:8377,configured:false,zeroTokenCaps:false};
  const config = JSON.parse(fs.readFileSync(file,'utf8'));
  const buyer = config?.buyer;
  if (!validPort(buyer?.proxyPort)) throw new Error('Invalid Antseed proxy port in colony config.');
  const pricing = buyer?.maxPricing;
  const caps = pricing?.defaults;
  // Reject service/provider overrides: they could bypass the default zero cap.
  const zeroTokenCaps = Boolean(caps && caps.inputUsdPerMillion===0 && caps.outputUsdPerMillion===0 && caps.cachedInputUsdPerMillion===0 && Object.keys(pricing).every(key=>key==='defaults'));
  return {port:buyer.proxyPort,configured:true,zeroTokenCaps};
}

export function antseedStartArgs(): string[] {
  const settings = readSettings();
  if (!settings.configured) throw new Error('Run npm run antseed -- setup first.');
  if (!settings.zeroTokenCaps) throw new Error('Colony start requires zero token price caps without service/provider overrides. Use the standalone Antseed CLI for an intentionally paid configuration.');
  const files = antseedPaths();
  return ['--data-dir',files.root,'--config',files.config,'buyer','start','--port',String(settings.port),'--max-input-usd-per-million','0','--max-output-usd-per-million','0'];
}

export function openclawAntseedConfig(model: string, contextWindow = 32768, maxTokens = 4096) {
  if (typeof model!=='string' || !model.trim() || model!==model.trim() || model.length>200 || /[\x00-\x1f\x7f]/.test(model)) throw new Error('Choose a model ID from npm run antseed -- models. Control characters and surrounding whitespace are not allowed.');
  if (!Number.isInteger(contextWindow) || !Number.isInteger(maxTokens) || maxTokens<1 || contextWindow<maxTokens || contextWindow>10_000_000) throw new Error('Use valid model context and output token limits.');
  const settings = readSettings();
  if (!settings.configured) throw new Error('Run npm run antseed -- setup first.');
  if (!settings.zeroTokenCaps) throw new Error('Colony configuration requires zero token price caps without service/provider overrides.');
  // A merge snippet only: never overwrite the user's OpenClaw agents or credentials.
  return { models:{providers:{antseed:{baseUrl:`http://127.0.0.1:${settings.port}/v1`,apiKey:'antseed-local',authHeader:true,api:'anthropic-messages',models:[{id:model,name:model,reasoning:false,input:['text'],contextWindow,maxTokens}]}}} };
}

type Model = {id:string; zeroTokenPrice:boolean; toolUse:boolean|null; offers:number};
export function normalizeAntseedModels(payload: unknown): Model[] {
  if (!payload || typeof payload!=='object' || !Array.isArray((payload as {data?:unknown}).data)) throw new Error('Proxy returned an invalid model catalog.');
  return (payload as {data:Record<string,any>[]}).data.slice(0,500).filter(entry=>entry && typeof entry.id==='string' && entry.id.length<=200 && entry.type!=='image' && entry.type!=='decision').map(entry=>{
    const peers = Array.isArray(entry.peers)?entry.peers:[];
    return {id:entry.id,offers:peers.length,toolUse:typeof entry.capabilities?.tool_use==='boolean'?entry.capabilities.tool_use:null,
      zeroTokenPrice:peers.some(peer=>peer && peer.inputUsdPerMillion===0 && peer.outputUsdPerMillion===0 && (peer.cachedInputUsdPerMillion===undefined || peer.cachedInputUsdPerMillion===0) && (peer.minImageUsdPerImage===undefined || peer.minImageUsdPerImage===0) && (peer.maxImageUsdPerImage===undefined || peer.maxImageUsdPerImage===0))};
  });
}

export async function inspectAntseed() {
  const files = antseedPaths();
  let settings;
  try { settings=readSettings(); }
  catch { return {configured:false,cliInstalled:fs.existsSync(files.cli),connected:false,zeroTokenCaps:false,models:[] as Model[],message:'Invalid colony Antseed config. Check the file with npm run antseed -- check.'}; }
  const result = {...settings,cliInstalled:fs.existsSync(files.cli),connected:false,baseUrl:`http://127.0.0.1:${settings.port}/v1`,models:[] as Model[],message:''};
  if (!settings.configured) return {...result,message:'Run npm run antseed -- install, then npm run antseed -- setup.'};
  if (!settings.zeroTokenCaps) return {...result,message:'Colony Antseed settings no longer have zero token price caps. Model setup is disabled; restore the starter caps or manage intentionally paid use separately.'};
  try {
    // Discovery only. Never infer, fund wallets, follow redirects or accept an arbitrary URL.
    const response=await fetch(`${result.baseUrl}/models?type=text`,{signal:AbortSignal.timeout(3000),redirect:'error'});
    if (!response.ok) throw new Error(`Proxy returned HTTP ${response.status}.`);
    if (!response.headers.has('x-antseed-request-id')) throw new Error('The local service did not identify itself as an Antseed proxy.');
    const chunks:Uint8Array[]=[];let size=0;
    if (!response.body) throw new Error('Empty model catalog.');
    for await (const chunk of response.body) {size+=chunk.byteLength;if(size>4*1024*1024)throw new Error('Model catalog exceeds 4 MiB.');chunks.push(chunk);}
    const models=normalizeAntseedModels(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const candidates=models.filter(model=>model.zeroTokenPrice).length;
    return {...result,connected:true,models,message:`${models.length} text models; ${candidates} advertise a zero-token-price offer. Availability, trust, tool support and seller quotas still apply. Listing models does not test inference or the running proxy's price policy.`};
  } catch(error) {
    const timeout=error instanceof Error && (error.name==='TimeoutError'||error.name==='AbortError');
    return {...result,message:timeout?'Model discovery timed out. The buyer may still be discovering peers; check its terminal and retry.':`Antseed proxy unavailable: ${error instanceof Error?error.message:'connection failed'}. Start it with npm run antseed -- start.`};
  }
}
