import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const temporary = mkdtempSync(path.join(tmpdir(), 'colony-antseed-'));
process.env.ANTFARM_HOME = temporary;
process.env.OPENCLAW_STATE_DIR = path.join(temporary, 'openclaw');
const { createDashboardServer } = await import('../dist/server/dashboard.js');
test.after(() => rmSync(temporary, {recursive:true,force:true}));

test('Antseed diagnostics are explicit, read-only and report an offline proxy', async () => {
  const server = createDashboardServer({workspace:temporary,host:'127.0.0.1'});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/providers/antseed`);
    assert.equal(response.status,200);
    const data = await response.json();
    assert.equal(data.connected,false);
    assert.equal(data.configured,false);
    assert.deepEqual(data.models,[]);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});

test('isolated Antseed setup preserves existing files and enforces zero token caps', async () => {
  const { initializeAntseed, antseedPaths, antseedStartArgs, openclawAntseedConfig } = await import('../dist/integrations/antseed.js');
  initializeAntseed(18377);
  const files = antseedPaths();
  const original = readFileSync(files.config,'utf8');
  assert.equal(JSON.parse(original).buyer.maxPricing.defaults.inputUsdPerMillion,0);
  assert.equal(JSON.parse(original).buyer.maxPricing.defaults.outputUsdPerMillion,0);
  assert.equal(JSON.parse(original).buyer.maxPricing.defaults.cachedInputUsdPerMillion,0);
  assert.throws(()=>initializeAntseed(8377),/already exists/);
  assert.equal(readFileSync(files.config,'utf8'),original);
  assert.ok(antseedStartArgs().includes('18377'));
  const snippet = openclawAntseedConfig('local-code-model');
  assert.equal(snippet.models.providers.antseed.baseUrl,'http://127.0.0.1:18377/v1');
  assert.equal(snippet.models.providers.antseed.models[0].id,'local-code-model');
  assert.equal(snippet.agents,undefined,'snippet does not overwrite existing agent list');
  writeFileSync(files.config,JSON.stringify({buyer:{proxyPort:18377,maxPricing:{defaults:{inputUsdPerMillion:1,outputUsdPerMillion:0}}}}));
  assert.throws(()=>antseedStartArgs(),/zero/);
  assert.throws(()=>openclawAntseedConfig('model'),/zero/);
  const {inspectAntseed}=await import('../dist/integrations/antseed.js');
  assert.equal((await inspectAntseed()).connected,false,'unsafe caps cannot show a ready connection');
  writeFileSync(files.config,original);
  assert.equal(openclawAntseedConfig('Claude Opus 5').models.providers.antseed.models[0].id,'Claude Opus 5');
});

test('local model catalog handles unknown prices, paid models and bad responses without sending inference', async () => {
  const { initializeAntseed, antseedPaths, inspectAntseed } = await import('../dist/integrations/antseed.js');
  const requests = [];
  let mode = 'ok';
  const proxy = createServer((req,res)=>{
    requests.push(`${req.method} ${req.url}`);
    res.setHeader('x-antseed-request-id','fixture');
    if(mode==='redirect'){res.writeHead(302,{Location:'http://example.invalid/'});res.end();return;}
    if(mode==='bad'){res.end('{');return;}
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({data:[
      {id:'zero',type:'text',peers:[{inputUsdPerMillion:0,outputUsdPerMillion:0}],capabilities:{tool_use:true}},
      {id:'paid',type:'text',peers:[{inputUsdPerMillion:1,outputUsdPerMillion:2}]},
      {id:'unknown',type:'text',peers:[{}]},
      {id:'cached-fee',type:'text',peers:[{inputUsdPerMillion:0,outputUsdPerMillion:0,cachedInputUsdPerMillion:1}]},
      {id:'picture',type:'image',peers:[{inputUsdPerMillion:0,outputUsdPerMillion:0,minImageUsdPerImage:1}]},
    ]}));
  });
  proxy.listen(0,'127.0.0.1'); await once(proxy,'listening');
  rmSync(antseedPaths().config); initializeAntseed(proxy.address().port);
  try {
    const result = await inspectAntseed();
    assert.equal(result.connected,true);
    assert.equal(result.models.length,4);
    assert.deepEqual(result.models.filter(m=>m.zeroTokenPrice).map(m=>m.id),['zero']);
    assert.equal(result.models[0].toolUse,true);
    assert.deepEqual(requests,['GET /v1/models?type=text']);
    mode='bad'; assert.equal((await inspectAntseed()).connected,false);
    mode='redirect'; assert.equal((await inspectAntseed()).connected,false);
    assert.ok(requests.every(request=>request==='GET /v1/models?type=text'));
  } finally { await new Promise(resolve=>proxy.close(resolve)); }
});
