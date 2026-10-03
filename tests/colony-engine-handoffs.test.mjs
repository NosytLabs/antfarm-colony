import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const temp=mkdtempSync(path.join(tmpdir(),'colony-engine-'));
process.env.ANTFARM_HOME=path.join(temp,'state');process.env.OPENCLAW_STATE_DIR=path.join(temp,'openclaw');
const {getDb}=await import('../dist/db.js');
const {claimStep,completeStep,failStep,peekStep}=await import('../dist/installer/step-ops.js');
const db=getDb(),now=new Date().toISOString();
const insertRun=(id,status='running')=>db.prepare('INSERT INTO runs (id,workflow_id,task,status,context,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id,'isolated-fixture','fixture',status,'{}',now,now);
const step=(run,id,index,status='pending',type='single',loop=null)=>db.prepare('INSERT INTO steps (id,run_id,step_id,agent_id,step_index,input_template,expects,status,type,loop_config,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(`${run}-${id}`,run,id,`${run}_${id}`,index,'Fixture work','STATUS: done',status,type,loop?JSON.stringify(loop):null,now,now);
// Keep a fixture workflow active so completion never attempts external cron cleanup.
insertRun('sentinel');
test.after(()=>rmSync(temp,{recursive:true,force:true}));

test('verify-each can claim its handoff while the parent story loop remains running',()=>{
  insertRun('loop');step('loop','build',0,'pending','loop',{over:'stories',completion:'all_done',verifyEach:true,verifyStep:'verify'});step('loop','verify',1,'waiting');
  db.prepare('INSERT INTO stories (id,run_id,story_index,story_id,title,description,acceptance_criteria,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run('story','loop',0,'S1','Example story','fixture','["check"]','pending',now,now);
  assert.equal(claimStep('loop_build').found,true);
  completeStep('loop-build','STATUS: done\nRESULT: implementation');
  assert.equal(db.prepare("SELECT status FROM steps WHERE id='loop-build'").get().status,'running');
  assert.equal(peekStep('loop_verify'),'HAS_WORK');
  assert.equal(claimStep('loop_verify').found,true);
  assert.equal(completeStep('loop-verify','STATUS: done\nRESULT: verified').runCompleted,true);
});
test('waiting and prematurely pending downstream work is not claimable',()=>{
  insertRun('serial');step('serial','first',0,'running');step('serial','next',1);
  assert.equal(peekStep('serial_next'),'NO_WORK');assert.equal(claimStep('serial_next').found,false);
  completeStep('serial-first','STATUS: done');assert.equal(claimStep('serial_next').found,true);
});
test('late completion or failure never changes a cancelled run',async()=>{
  insertRun('cancelled','cancelled');step('cancelled','work',0,'running');
  completeStep('cancelled-work','STATUS: done\nRESULT: late response');await failStep('cancelled-work','late failure');
  assert.equal(db.prepare("SELECT status FROM runs WHERE id='cancelled'").get().status,'cancelled');
  const saved=db.prepare("SELECT status,output,retry_count FROM steps WHERE id='cancelled-work'").get();
  assert.equal(saved.status,'running');assert.equal(saved.output,null);assert.equal(saved.retry_count,0);
});
