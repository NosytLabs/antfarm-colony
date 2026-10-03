import test from 'node:test';
import assert from 'node:assert/strict';
import { AntfarmColony } from '../integrations/opencode/antfarm-colony.js';

test('OpenCode hooks send only local status metadata and never task contents', async () => {
 const originalFetch=globalThis.fetch, originalUrl=process.env.ANTFARM_COLONY_URL;
 const captured=[];process.env.ANTFARM_COLONY_URL='http://127.0.0.1:8114';
 globalThis.fetch=async(url,options)=>{captured.push({url,data:JSON.parse(options.body)});return {ok:true};};
 try {
  const plugin=await AntfarmColony();
  await plugin['tool.execute.before']({sessionID:'session-a',callID:'call-a',tool:'read'}, {args:{file:'private-file',prompt:'private prompt'}});
  await plugin.event({event:{type:'permission.asked',properties:{sessionID:'session-a',permission:'private'}}});
  await plugin.event({event:{type:'session.idle',properties:{sessionID:'session-a'}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(captured.length,3);
  assert.ok(captured.every(e=>e.url==='http://127.0.0.1:8114/api/bridge/events'));
  assert.deepEqual(captured.map(e=>e.data.status),['running','blocked','idle']);
  assert.ok(captured.every(e=>e.data.role==='scout'));
  assert.equal(JSON.stringify(captured).includes('private'),false);
  assert.equal(new Set(captured.map(e=>e.data.eventId)).size,3);
  process.env.ANTFARM_COLONY_URL='https://example.com';
  await assert.rejects(()=>AntfarmColony(),/loopback/);
 } finally {globalThis.fetch=originalFetch;if(originalUrl===undefined)delete process.env.ANTFARM_COLONY_URL;else process.env.ANTFARM_COLONY_URL=originalUrl;}
});
