import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function setup(t){
 const module=await import('../integrations/hardfire/stall-capture.js').catch(()=>null);
 assert.ok(module,'stall capture integration must exist');
 const artifactDir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-stall-'));
 t.after(()=>fs.rm(artifactDir,{recursive:true,force:true}));
 const events=[],records=[];let time=1000;
 const snapshot={key:'bonus',evidence:{tab_id:7},flags:{canSpin:false,spinBlockingFeatureIsRunning:true},capture:{pending:false,uncertain:false},operation:{sequence:4,protocolSequence:6,nextAction:'s'},choices:[]};
 const diagnostic=module.createStallCapture({artifactDir,now:()=>time,captureImage:async()=>{events.push('capture');return {tabId:7,bytes:Buffer.from([255,216,255,224,0,1,255,217])};},onCapture:r=>records.push(r)});
 return {module,artifactDir,events,records,snapshot,diagnostic,setTime:v=>{time=v;}};
}

test('a blocked operation is photographed before reset and preserves its original outcome',async t=>{
 const h=await setup(t),outcome={ok:false,reason:'OPERATION_STALLED',snapshot:h.snapshot,completion:{blockers:['FEATURE_BLOCKING']}};
 const adapter={snapshot:async()=>h.snapshot,reset:async()=>h.events.push('reset'),click:async()=>h.events.push('click'),finishOperation:async()=>outcome};
 const wrapped=Object.assign(adapter,h.module.withStallCaptures(adapter,h.diagnostic));
 await wrapped.snapshot();await wrapped.click({key:'Buy'});const result=await wrapped.finishOperation();await wrapped.reset();
 assert.deepEqual(h.events,['click','capture','reset']);assert.equal(result.reason,'OPERATION_STALLED');
 assert.equal(result.stallCapture.reason,'OPERATION_STALLED');assert.equal(result.stallCapture.lastAction.key,'Buy');
 assert.equal(result.stallCapture.protocol.sequence,4);assert.equal(h.records.length,1);
 assert.ok((await fs.readFile(result.stallCapture.full_path)).length>0);
});

test('failed physical input is captured without swallowing the actual error or retrying it',async t=>{
 const h=await setup(t),error=Object.assign(Error('AMBIGUOUS_HIT_AREA'),{code:'AMBIGUOUS_HIT_AREA'});
 const wrapped=h.module.withStallCaptures({snapshot:async()=>h.snapshot,click:async()=>{throw error;}},h.diagnostic);
 await wrapped.snapshot();await assert.rejects(wrapped.click({key:'Choice'}),e=>e===error);
 assert.equal(h.records[0].reason,'AMBIGUOUS_HIT_AREA');assert.deepEqual(h.events,['capture']);
});

test('transition timeouts preserve a screenshot before continuing to the next route',async t=>{
 const h=await setup(t);const out=await h.diagnostic.transition({snapshot:h.snapshot,reason:'ACTIVE_TIMEOUT'});
 assert.equal(out.reason,'ACTIVE_TIMEOUT');assert.equal(out.stallCapture.phase,'transition');assert.equal(h.records.length,1);
});

test('successful operations and successful transitions do not trigger diagnostic images',async t=>{
 const h=await setup(t);const wrapped=h.module.withStallCaptures({finishOperation:async()=>({ok:true,snapshot:h.snapshot})},h.diagnostic);
 await wrapped.finishOperation();await h.diagnostic.transition({reason:'STATE_CHANGED',snapshot:h.snapshot});assert.deepEqual(h.events,[]);
});

test('capture errors are explicit and cannot replace an operation failure',async t=>{
 const h=await setup(t);const d=h.module.createStallCapture({artifactDir:h.artifactDir,captureImage:async()=>{throw Error('screen not available');}});
 const wrapped=h.module.withStallCaptures({finishOperation:async()=>({ok:false,reason:'OPERATION_STALLED',snapshot:h.snapshot})},d);
 const result=await wrapped.finishOperation();assert.equal(result.reason,'OPERATION_STALLED');assert.equal(result.stallCapture.error,'STALL_CAPTURE_FAILED');
});

test('journal keeps the newest bounded captures across new campaign slices',async t=>{
 const h=await setup(t);
 const options={artifactDir:h.artifactDir,maxCaptures:2,captureImage:async()=>({tabId:7,bytes:Buffer.from([255,216,255,224,255,217])})};
 const d=h.module.createStallCapture(options);const first=await d.capture('FIRST',h.snapshot);
 await d.capture('SECOND',h.snapshot);await h.module.createStallCapture(options).capture('THIRD',h.snapshot);
 const journal=JSON.parse(await fs.readFile(path.join(h.artifactDir,'stall-captures.json'),'utf8'));
 assert.deepEqual(journal.captures.map(c=>c.reason),['SECOND','THIRD']);assert.equal(journal.omitted,1);
 await assert.rejects(fs.access(first.full_path));
});
