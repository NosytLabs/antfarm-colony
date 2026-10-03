import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

const workspace=mkdtempSync(path.join(tmpdir(),'colony-harness-'));
process.env.ANTFARM_HOME=path.join(workspace,'state');
const fixture=path.join(workspace,'fixture.mjs');
writeFileSync(fixture, `import fs from 'node:fs';
const prompt=process.argv[2];fs.appendFileSync('prompts.txt',prompt+'\\n---\\n');
if(prompt.includes('WAIT-FIXTURE')) { console.log('Progress: waiting pid='+process.pid);setTimeout(()=>fs.writeFileSync('too-late.txt','bad'),5000); }
else if(prompt.includes('implementation specialist')&&!fs.existsSync('allow-build')) { console.log('Partial implementation');process.exitCode=2; }
else if(prompt.includes('verification specialist'))console.log(prompt.includes('BAD-VERDICT')?'Checks incomplete':'VERDICT: PASS');
else console.log('Completed with evidence: '+(prompt.includes('Previous step results')?'handoff received':'none'));
`);
process.env.ANTFARM_HARNESS_COMMAND=JSON.stringify([process.execPath,fixture,'{prompt}']);
const {createDashboardServer}=await import('../dist/server/dashboard.js');
const {getDb}=await import('../dist/db.js');
const {publicOutput,recoverHarnessRuns}=await import('../dist/server/harness.js');
const server=createDashboardServer({workspace});server.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`;
const post=async(url,body={})=>{const response=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
const run=async id=>(await fetch(`${base}/api/runs/${id}`)).json();
async function until(predicate){for(let i=0;i<100;i++){const result=await predicate();if(result)return result;await new Promise(r=>setTimeout(r,50));}throw Error('Condition not reached');}
test.after(()=>{server.close();rmSync(workspace,{recursive:true,force:true});});

test('real child process preserves literal prompt text and persists output',async()=>{
  const literal='Check literal $(touch INJECTED) `touch INJECTED`';
  const result=await post('/api/runs',{workflowId:'cli-task',runtime:'custom',task:literal});assert.equal(result.status,201);
  const finished=await until(async()=>{const r=await run(result.body.id);return r.status==='completed'&&r;});
  assert.match(finished.steps[0].output,/Completed with evidence/);
  assert.ok(readFileSync(path.join(workspace,'prompts.txt'),'utf8').includes(literal));assert.equal(existsSync(path.join(workspace,'INJECTED')),false);
});
test('team failure blocks downstream work; resume keeps successful steps and hands off results',async()=>{
  const result=await post('/api/runs',{workflowId:'cli-team',runtime:'custom',task:'Implement a fixture'});
  const failed=await until(async()=>{const r=await run(result.body.id);return r.status==='failed'&&r;});
  assert.deepEqual(failed.steps.map(s=>s.status),['done','failed','pending']);assert.match(failed.steps[1].output,/Partial implementation/);
  writeFileSync(path.join(workspace,'allow-build'),'yes');
  assert.equal((await post(`/api/runs/${failed.id}/resume`)).status,200);
  const done=await until(async()=>{const r=await run(failed.id);return r.status==='completed'&&r;});
  assert.deepEqual(done.steps.map(s=>s.status),['done','done','done']);assert.match(done.steps[2].output,/VERDICT: PASS/);
  assert.equal(readFileSync(path.join(workspace,'prompts.txt'),'utf8').split('You are the planning specialist').length-1,1);
});
test('cancellation stops the process and preserves partial output; capacity is enforced',async()=>{
  const result=await post('/api/runs',{workflowId:'cli-task',runtime:'custom',task:'WAIT-FIXTURE'});
  await until(async()=> (await run(result.body.id)).steps[0].output?.includes('waiting'));
  assert.equal((await post('/api/runs',{workflowId:'cli-task',runtime:'custom',task:'second'})).status,409);
  assert.equal((await post(`/api/runs/${result.body.id}/cancel`)).status,200);
  await new Promise(r=>setTimeout(r,150));
  const cancelled=await run(result.body.id);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.steps[0].status,'cancelled');assert.match(cancelled.steps[0].output,/waiting/);
  const pid=Number(cancelled.steps[0].output.match(/pid=(\d+)/)[1]);
  assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
  assert.equal(existsSync(path.join(workspace,'too-late.txt')),false);
});
test('structured runtime output keeps public text and tool status, omits reasoning payloads',()=>{
  assert.equal(publicOutput('{"type":"reasoning","part":{"text":"private"}}','opencode'),'');
  assert.equal(publicOutput('{"type":"text","part":{"text":"Result"}}','opencode'),'Result');
  assert.equal(publicOutput('{"type":"tool_use","part":{"tool":"read","state":{"status":"completed"}}}','opencode'),'Tool: read (completed)');
});
test('interrupted CLI records require explicit resume after restart',()=>{
  const db=getDb(),now=new Date().toISOString();
  db.prepare("INSERT INTO runs (id,workflow_id,task,status,created_at,updated_at) VALUES ('interrupted','cli-task','fixture','running',?,?)").run(now,now);
  recoverHarnessRuns();assert.equal(db.prepare("SELECT status FROM runs WHERE id='interrupted'").get().status,'failed');
});


test('successful process exit cannot bypass the verification gate',async()=>{
  const result=await post('/api/runs',{workflowId:'cli-team',runtime:'custom',task:'BAD-VERDICT fixture'});
  const failed=await until(async()=>{const r=await run(result.body.id);return r.status==='failed'&&r;});
  assert.deepEqual(failed.steps.map(s=>s.status),['done','done','failed']);
  assert.match(failed.steps[2].output,/Checks incomplete/);
  assert.match(failed.steps[2].output,/Verification did not report/);
});
test('structured runtime errors fail the mission even with exit zero',async()=>{
  const previous=process.env.PATH,command=path.join(workspace,'opencode');
  writeFileSync(command,`#!${process.execPath}\nconsole.log(JSON.stringify({type:'error',error:{message:'fixture provider failure'}}));\n`);chmodSync(command,0o755);
  process.env.PATH=workspace+path.delimiter+previous;
  try{
    const result=await post('/api/runs',{workflowId:'cli-task',runtime:'opencode',task:'Test structured errors'});
    const failed=await until(async()=>{const r=await run(result.body.id);return r.status==='failed'&&r;});
    assert.match(failed.steps[0].output,/fixture provider failure/);
  }finally{process.env.PATH=previous;}
});
test('Hermes structured events expose tool status and final output only',()=>{
  assert.equal(publicOutput(JSON.stringify({type:'tool_use',name:'read',input:{secret:'do not display'}}),'hermes'),'Tool: read (running)');
  assert.equal(publicOutput(JSON.stringify({type:'reasoning',text:'hidden'}),'hermes'),'');
  assert.equal(publicOutput(JSON.stringify({type:'result',exit_code:0,text:'VERDICT: PASS'}),'hermes'),'VERDICT: PASS');
});
