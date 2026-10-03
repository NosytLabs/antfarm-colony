import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoColony,demoWorkflows} from '../web/demo.js';
globalThis.window=new EventTarget();

test('demo completes every handoff and the final step',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const demo=new DemoColony(),dispatch=demo.launch('cli-team','Example mission');
  t.mock.timers.tick(380);const run=await dispatch;
  t.mock.timers.tick(12000);
  assert.deepEqual(demo.tasks.filter(t=>t.run_id===run.id).map(t=>t.status),['done','running','queued']);
  t.mock.timers.tick(24000);
  assert.ok(demo.tasks.filter(t=>t.run_id===run.id).every(t=>t.status==='done'&&t.result));
  assert.ok(demo.agents.filter(a=>a.id.includes(run.id)).every(a=>a.status==='done'));
  demo.destroy();
});
test('cancelled demo callbacks never resurrect steps or erase completed work',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const demo=new DemoColony(),dispatch=demo.launch('cli-team','Cancel example');
  t.mock.timers.tick(380);const run=await dispatch;t.mock.timers.tick(12000);
  demo.cancel(run.id);t.mock.timers.runAll();
  assert.deepEqual(demo.tasks.filter(t=>t.run_id===run.id).map(t=>t.status),['done','cancelled','cancelled']);
  assert.ok(demo.agents.some(a=>a.id.includes(run.id)&&a.status==='done'));demo.destroy();
});
test('demo catalog retains full upstream pipelines and CLI teams',()=>{
  assert.equal(demoWorkflows.find(f=>f.id==='feature-dev').steps.length,7);
  assert.equal(demoWorkflows.find(f=>f.id==='bug-fix').steps.length,6);
  assert.equal(demoWorkflows.find(f=>f.id==='cli-team').steps.length,3);
});
