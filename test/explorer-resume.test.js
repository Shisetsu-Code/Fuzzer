import test from 'node:test';
import assert from 'node:assert/strict';
import {exploreStates} from '../providers/pragmatic/state-explorer.js';

const clone=value=>JSON.parse(JSON.stringify(value));
function fixture({stuck=false}={}) {
 let state='root',time=0,resets=0;
 const clicks=[];
 const adapter={now:()=>time,reset:async()=>{resets++;state='root';},
  snapshot:async()=>({key:state,controls:state==='root'?[{key:'a'},{key:'b'}]:[],traffic:0}),
  click:async b=>{clicks.push(b.key);time++;if(!stuck||b.key==='b')state='done';}};
 const wait=async()=>({snapshot:await adapter.snapshot(),reason:state==='root'?'QUIET_TIMEOUT':'STATE_CHANGED'});
 return {adapter,wait,clicks,get resets(){return resets;},options:{mode:'actions',maxActions:10,maxRetries:2,sliceAttempts:1,wait}};
}

test('a JSON checkpoint resumes FIFO siblings without repeating a resolved edge',async()=>{
 const h=fixture();const first=await exploreStates(h.adapter,h.options);
 assert.equal(first.stopReason,'SLICE_LIMIT');assert.deepEqual(first.edges.map(e=>e.action),['a']);
 const second=await exploreStates(h.adapter,{...h.options,resumeState:clone(first.resumeState)});
 assert.equal(second.status,'EXHAUSTED_OBSERVED_CONTROLS');
 assert.deepEqual(second.edges.map(e=>e.action),['a','b']);assert.deepEqual(h.clicks,['a','b']);
 assert.equal(second.actions,2);assert.equal(second.recovery.resolvedRoutes,2);
});

test('new FIFO work precedes retries across slices and retry allowance is never reset',async()=>{
 const h=fixture({stuck:true});let result;
 for(let i=0;i<6;i++){
  result=await exploreStates(h.adapter,{...h.options,resumeState:result&&clone(result.resumeState)});
  assert.ok(result.resumeState,'scheduler state must be exported');
  if(result.stopReason!=='SLICE_LIMIT')break;
 }
 assert.deepEqual(h.clicks,['a','b','a','a']);
 assert.equal(result.stopReason,'BLOCKED_ROUTES');assert.equal(result.recovery.retries,2);
 assert.equal(result.pending.filter(p=>p.action==='a').length,1);
 assert.equal(result.pending.find(p=>p.action==='a').attempts,3);
});

test('a target interrupted at deadline remains resumable without a fabricated successful edge',async()=>{
 const h=fixture();let saved;
 const first=await exploreStates(h.adapter,{...h.options,deadline:1,onProgress:p=>{saved=clone(p);}});
 assert.equal(first.actions,1);assert.equal(first.edges.length,0);assert.equal(first.stopReason,'DEADLINE');
 assert.ok(first.resumeState,'the removed in-flight task must be retained');
 const second=await exploreStates(h.adapter,{...h.options,resumeState:clone(first.resumeState),sliceAttempts:10});
 assert.equal(second.recovery.resolvedRoutes,2);
 assert.deepEqual(h.clicks,['a','b','a'],'interrupted work gets a clean retry after fresh siblings');
 assert.equal(second.attemptedActions,3);assert.ok(saved.resumeState);
});

test('campaign action limits survive a checkpoint and cannot be reset by another slice',async()=>{
 const h=fixture();const options={...h.options,maxActions:1};
 const first=await exploreStates(h.adapter,options);assert.ok(first.resumeState);
 const second=await exploreStates(h.adapter,{...options,resumeState:clone(first.resumeState)});
 assert.equal(second.stopReason,'ACTION_LIMIT');assert.deepEqual(h.clicks,['a']);
});

test('incompatible, corrupt and cleanup-blocked checkpoints are refused before resetting a session',async()=>{
 const h=fixture();const result=await exploreStates(h.adapter,h.options);assert.ok(result.resumeState);
 for(const state of [{schema:'unknown'},{...clone(result.resumeState),cleanupPending:true},{...clone(result.resumeState),routes:[]}]){
  const before=h.resets;
  await assert.rejects(exploreStates(h.adapter,{...h.options,resumeState:state}),/RESUME_/);
  assert.equal(h.resets,before);
 }
 await assert.rejects(exploreStates(h.adapter,{...h.options,maxDepth:7,resumeState:clone(result.resumeState)}),/RESUME_/);
});

test('one failed checkpoint write is fatal instead of allowing the next sibling input',async()=>{
 const h=fixture();let failed=false;
 await assert.rejects(exploreStates(h.adapter,{...h.options,sliceAttempts:10,onProgress:async p=>{
  if(p.inFlight&&!failed){failed=true;throw Error('DISK_FULL');}
 }}),/CHECKPOINT_WRITE_FAILED/);
 assert.deepEqual(h.clicks,[]);
});

test('restoring a pre-input checkpoint treats its active task as uncertain and retries only in a fresh session',async()=>{
 const h=fixture();let interrupted;
 await exploreStates(h.adapter,{...h.options,onProgress:p=>{if(p.inFlight?.phase==='action'&&!interrupted)interrupted=clone(p.resumeState);}});
 assert.ok(interrupted?.activeTask);
 const resets=h.resets;
 const result=await exploreStates(h.adapter,{...h.options,sliceAttempts:10,resumeState:interrupted});
 assert.ok(h.resets>resets);assert.deepEqual(h.clicks,['a','b','a']);
 assert.deepEqual(result.edges.map(e=>e.action),['b','a'],'the uncertain first action is not invented as a successful edge');
 assert.equal(result.attemptHistory[0].reason,'INTERRUPTED_ATTEMPT');assert.equal(result.attemptHistory[0].uncertain,true);
 assert.equal(result.attemptedActions,3);
});
