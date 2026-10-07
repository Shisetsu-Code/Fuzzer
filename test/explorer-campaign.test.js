import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {exploreStates} from '../providers/pragmatic/state-explorer.js';

async function setup(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-campaign-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const {runExplorerCampaign}=await import('../lib/explorer-campaign.js');
 let time=0,executions=0;const clicks=[],started=[],progress=[];
 const execute=async options=>{
  executions++;started.push(time);let state='root';
  const a={now:()=>time,reset:async()=>{state='root';},snapshot:async()=>({key:state,controls:state==='root'?[{key:'a'},{key:'b'},{key:'c'}]:[],traffic:0}),click:async b=>{clicks.push(b.key);state='done';time+=10;}};
  const result=await exploreStates(a,{...options,deadline:time+options.timeoutMs,wait:async()=>({snapshot:await a.snapshot(),reason:'STATE_CHANGED'})});
  return {...result,cleanupPending:false,retainedTabIds:[],savedHarPaths:[...(options.savedHarPaths||[]),path.join(dir,`part-${executions}.har`)],branchCaptures:[{capture_id:`part-${executions}`}]};
 };
 const options={artifactDir:dir,identity:{gameUrl:'https://www.pragmaticplay.fun/en/slots/demo/',revision:'test'},mode:'actions',maxActions:10,maxDepth:4,maxRetries:2,sliceAttempts:1,timeoutMs:1000,now:()=>time,onProgress:p=>{progress.push(p);}};
 return {dir,runExplorerCampaign,execute,options,clicks,started,progress,get executions(){return executions;},advance(ms){time+=ms;}};
}

test('one campaign autonomously completes all slices and retains cumulative evidence and counters',async t=>{
 const h=await setup(t);const result=await h.runExplorerCampaign(h.execute,h.options);
 assert.deepEqual(h.clicks,['a','b','c']);assert.equal(h.executions,3);
 assert.equal(result.actions,3);assert.equal(result.status,'EXHAUSTED_OBSERVED_CONTROLS');
 assert.equal(result.campaign.slices,3);assert.equal(result.savedHarPaths.length,3);assert.equal(result.branchCaptures.length,3);
 assert.ok(h.progress.every(p=>p.campaign.deadline===1000));
 const again=await h.runExplorerCampaign(h.execute,h.options);
 assert.equal(h.executions,3,'a completed persisted campaign must not start again');assert.equal(again.actions,3);
});

test('elapsed cleanup and checkpoint time consumes the same global deadline',async t=>{
 const h=await setup(t);
 const result=await h.runExplorerCampaign(async options=>{const r=await h.execute(options);h.advance(990);return r;},h.options);
 assert.equal(h.executions,1);assert.equal(result.stopReason,'DEADLINE');assert.equal(result.status,'PARTIAL');
 const again=await h.runExplorerCampaign(h.execute,h.options);assert.equal(h.executions,1);assert.equal(again.stopReason,'DEADLINE');
});

test('a campaign action cap cannot reset when it crosses a slice boundary',async t=>{
 const h=await setup(t);const result=await h.runExplorerCampaign(h.execute,{...h.options,maxActions:2});
 assert.deepEqual(h.clicks,['a','b']);assert.equal(result.stopReason,'ACTION_LIMIT');assert.equal(result.actions,2);
});

test('cleanup pending stops automatic continuation and refuses reuse of its journal',async t=>{
 const h=await setup(t);
 const result=await h.runExplorerCampaign(async o=>({...await h.execute(o),cleanupPending:true,retainedTabIds:[42]}),h.options);
 assert.equal(h.executions,1);assert.equal(result.stopReason,'CLEANUP_FAILED');
 await assert.rejects(h.runExplorerCampaign(h.execute,h.options),/CAMPAIGN_CLEANUP_UNCONFIRMED/);assert.equal(h.executions,1);
});

test('a failed progress write never permits another input or silently starts a fresh campaign',async t=>{
 const h=await setup(t);let failed=false;
 await assert.rejects(h.runExplorerCampaign(h.execute,{...h.options,onProgress:p=>{if(p.inFlight&&!failed){failed=true;throw Error('DISK_FULL');}}}),/CHECKPOINT_WRITE_FAILED/);
 assert.deepEqual(h.clicks,[]);
 await assert.rejects(h.runExplorerCampaign(h.execute,h.options),/CAMPAIGN_CLEANUP_UNCONFIRMED/);
});

test('corrupt, wrong-game and concurrently owned journals fail before creating a session',async t=>{
 const h=await setup(t);await fs.writeFile(path.join(h.dir,'campaign.json'),'{broken');
 await assert.rejects(h.runExplorerCampaign(h.execute,h.options),/CAMPAIGN_INVALID/);assert.equal(h.executions,0);
 await fs.rm(path.join(h.dir,'campaign.json'));await h.runExplorerCampaign(h.execute,h.options);
 await assert.rejects(h.runExplorerCampaign(h.execute,{...h.options,identity:{gameUrl:'different'}}),/CAMPAIGN_IDENTITY_MISMATCH/);assert.equal(h.executions,3);
 await fs.writeFile(path.join(h.dir,'campaign.lock'),'other-process');
 await assert.rejects(h.runExplorerCampaign(h.execute,h.options),/CAMPAIGN_ALREADY_OWNED/);
 assert.equal(await fs.readFile(path.join(h.dir,'campaign.lock'),'utf8'),'other-process');
});

test('a checkpoint with no forward progress cannot create an infinite supervisor loop',async t=>{
 const h=await setup(t);let count=0;
 const base=await h.execute({...h.options,timeoutMs:1000});
 const result=await h.runExplorerCampaign(async()=>{count++;return structuredClone(base);},h.options);
 assert.equal(count,2);assert.equal(result.stopReason,'CAMPAIGN_NO_PROGRESS');
});

test('failed HAR consolidation stops the campaign instead of resuming without its evidence',async t=>{
 const h=await setup(t);
 const result=await h.runExplorerCampaign(async o=>({...await h.execute(o),artifactError:'HAR write failed'}),h.options);
 assert.equal(h.executions,1);assert.equal(result.stopReason,'ARTIFACT_FAILED');assert.equal(result.status,'PARTIAL');
});
