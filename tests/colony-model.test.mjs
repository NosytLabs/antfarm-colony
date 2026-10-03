import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAMBERS,routeBetween,roleOf,chamberFor,trailStrength,trailsFromTasks,clampCamera} from '../web/colony-model.js';
test('panning at any zoom keeps every viewport edge inside the scene',()=>{
 for(const zoom of [1,1.1,1.5,2.5])for(const candidate of [{x:-900,y:-900},{x:9999,y:9999}]){
  const width=360,height=240,scale=width/1536*zoom;
  const c=clampCamera(candidate,width,height,scale);
  assert.ok(c.x-width/scale/2>=-1e-8);assert.ok(c.x+width/scale/2<=1536+1e-8);
  assert.ok(c.y-height/scale/2>=-1e-8);assert.ok(c.y+height/scale/2<=1024+1e-8);
 }
});
test('every chamber is reachable through tunnel waypoints',()=>{
 for(const a of CHAMBERS)for(const b of CHAMBERS){const route=routeBetween(a.id,b.id);assert.ok(route.length);assert.deepEqual(route.at(-1),{x:b.x,y:b.y});for(const p of route){assert.ok(p.x>=0&&p.x<=1536);assert.ok(p.y>=0&&p.y<=1024);}}
});
test('actual role and state decide chamber, not random timers',()=>{
 assert.equal(roleOf({id:'feature-dev_developer'}),'builder');
 assert.equal(roleOf({role:'verification'}),'verifier');
 assert.equal(chamberFor({role:'builder',status:'running'}),'workshop');
 assert.equal(chamberFor({role:'builder',status:'done'}),'granary');
 assert.equal(chamberFor({role:'builder',status:'failed'}),'review');
 assert.equal(chamberFor({role:'planner',status:'queued'}),'nursery');
});
test('signals decay and never become negative or exceed one',()=>{
 const now=Date.now();assert.equal(trailStrength(now,now),1);
 assert.ok(trailStrength(now-1800000,now)<.38);
 assert.equal(trailStrength('invalid',now),0);
 assert.equal(trailStrength(now+1000,now),1);
});
test('only completed dependencies leave trails',()=>{
 const tasks=[{id:'a',status:'running',assigned_to:'scout',updated_at:new Date().toISOString()},{id:'b',status:'queued',assigned_to:'developer',depends_on:['a']}];
 assert.deepEqual(trailsFromTasks(tasks,[]),[]);
 tasks[0].status='done';assert.equal(trailsFromTasks(tasks,[]).length,1);
});
