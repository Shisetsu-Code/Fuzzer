import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {registerFuzzerTools} from '../integrations/hardfire/mcp-tools.js';

for(const startup of [false,true])test(`MCP keeps admission occupied after ${startup?'startup':'session'} cleanup rejects until owned closure is confirmed`,async()=>{
 const tools=new Map(),chain={};for(const name of ['int','positive','optional','default','url','min','max','uuid'])chain[name]=()=>chain;
 const z={number:()=>chain,string:()=>chain,boolean:()=>chain};const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-retained-slot-'));
 const releases=new Map();let created=0;
 registerFuzzerTools({register:(name,d,s,r,fn)=>tools.set(name,fn),z,text:v=>v,artifactDir:dir,controller:{tabs:{resolve:()=>({})}},
  sessionFactory:async(controller,{onOwnedTab,onClosedTab})=>{
   const id=301+created++;onOwnedTab?.(id);releases.set(id,()=>onClosedTab?.(id));
   if(startup)throw Object.assign(new Error('entry failed'),{cleanupError:'HAR write failed',retainedTabIds:[id]});
   const session={tabId:id,observe:async()=>{throw new Error('observe failed');},close:async()=>{session.har={path:`saved-${id}.har`};throw new Error('HAR write failed');}};return session;
  }});
 const start=()=>tools.get('pragmatic_fuzz_start')({tab_id:3,game_url:'https://www.pragmaticplay.fun/en/slots/demo/',execute:false});
 const read=job_id=>tools.get('pragmatic_fuzz_result')({job_id,offset:0,limit:5,graph_offset:0,graph_limit:50});
 const finished=async job=>{for(let i=0;i<100;i++){const r=await read(job.job_id);if(r.artifact)return r;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('job did not finish');};
 try{
  const first=await start(),second=await start();const a=await finished(first);await finished(second);
  await assert.rejects(start(),/2|Two/);assert.equal(created,2);
  assert.deepEqual(a.retainedTabIds,[301]);assert.equal(a.cleanupPending,true);assert.match(a.cleanupError,/HAR write failed/);
  if(!startup)assert.deepEqual(a.har,{path:'saved-301.har'});
  releases.get(301)();assert.equal((await read(first.job_id)).cleanupPending,false);
  const third=await start();await finished(third);assert.equal(created,3);
 }finally{for(const release of releases.values())release();await fs.rm(dir,{recursive:true,force:true});}
});

test('MCP retains unknown branch ownership after preparation closes successfully',async()=>{
 const tools=new Map(),chain={};for(const name of ['int','positive','optional','default','url','min','max','uuid'])chain[name]=()=>chain;
 const z={number:()=>chain,string:()=>chain,boolean:()=>chain};const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-unknown-owner-'));
 let releaseSecond,created=0;const base={phase:'base',terminal:true,inventoryKnown:true,options:[]},buy={id:'buy:0',kind:'buy'};
 registerFuzzerTools({register:(name,d,s,r,fn)=>tools.set(name,fn),z,text:v=>v,artifactDir:dir,controller:{tabs:{resolve:()=>({})}},
  sessionFactory:async(controller,{onOwnedTab,onClosedTab})=>{
   if(created++)return {observe:async()=>{await new Promise(resolve=>{releaseSecond=resolve;});return base;},probeBet:async()=>({status:'PENDING',restored:false}),close:async()=>{}};
   onOwnedTab(411);return {observe:async()=>({...base,options:[buy]}),probeBet:async()=>({status:'OBSERVED',restored:true,before:{bet:1,options:[]}}),
    forkDemo:async()=>{let done=false;return {observe:async()=>done?base:{...base,options:[buy]},perform:async()=>{done=true;return {ok:true};},capture:async()=>({}),waitForTransition:async()=>true,close:async()=>{throw new Error('legacy close failed without tab id');}};},
    close:async()=>onClosedTab(411)};
  }});
 const start=()=>tools.get('pragmatic_fuzz_start')({tab_id:3,game_url:'https://www.pragmaticplay.fun/en/slots/demo/',execute:true});
 const read=job_id=>tools.get('pragmatic_fuzz_result')({job_id,offset:0,limit:5,graph_offset:0,graph_limit:50});
 let second;
 try{
  const first=await start();let result;for(let i=0;i<100;i++){result=await read(first.job_id);if(result.artifact)break;await new Promise(resolve=>setTimeout(resolve,5));}
  assert.equal(result.cleanupPending,true);assert.deepEqual(result.retainedTabIds,[]);
  second=await start();await assert.rejects(start(),/2|Two/);
 }finally{releaseSecond?.();if(second){for(let i=0;i<100;i++){if((await read(second.job_id)).artifact)break;await new Promise(resolve=>setTimeout(resolve,5));}}await fs.rm(dir,{recursive:true,force:true});}
});

test('explicit job cleanup retries only retained save-and-close closures and releases admission once',async()=>{
 const tools=new Map(),chain={};for(const name of ['int','positive','optional','default','url','min','max','uuid'])chain[name]=()=>chain;
 const z={number:()=>chain,string:()=>chain,boolean:()=>chain};const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-mcp-cleanup-'));
 await fs.writeFile(path.join(dir,'HARs'),'blocked');const tabs=new Map(),closed=[];let created=0,stops=0;
 const controller={tabs:{new:async()=>{const id=501+created++;const recorder={recording:true,stop:async()=>{stops++;recorder.recording=false;return {log:{entries:[{fixture:id}]}};}};tabs.set(id,{sessionIsolated:true,recorder});return {id};},resolve:id=>tabs.get(id)||{},close:async id=>{closed.push(id);tabs.delete(id);}},
  withTab:()=>({recordStart:async()=>{throw new Error('startup failed');},screenshot:async()=>{throw new Error('no pixels');}})};
 registerFuzzerTools({register:(name,d,s,r,fn)=>tools.set(name,fn),z,text:v=>v,artifactDir:dir,controller});
 const start=()=>tools.get('pragmatic_fuzz_start')({tab_id:3,game_url:'https://www.pragmaticplay.fun/en/slots/demo/',execute:false});
 const read=job_id=>tools.get('pragmatic_fuzz_result')({job_id,offset:0,limit:5,graph_offset:0,graph_limit:50});
 const finished=async job=>{for(let i=0;i<100;i++){const r=await read(job.job_id);if(r.artifact)return r;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('job did not finish');};
 try{
  const first=await start(),second=await start();await finished(first);await finished(second);await assert.rejects(start(),/2|Two/);
  const cleanup=tools.get('pragmatic_fuzzer_cleanup');assert.equal(typeof cleanup,'function');
  const failed=await cleanup({job_id:first.job_id});assert.equal(failed.cleanupPending,true);assert.deepEqual(closed,[]);await assert.rejects(start(),/2|Two/);
  await fs.unlink(path.join(dir,'HARs'));const restored=await cleanup({job_id:first.job_id});
  assert.equal(restored.cleanupPending,false);assert.deepEqual(closed,[501]);assert.equal(created,2);assert.equal(stops,2);
  assert.equal(JSON.parse(await fs.readFile(restored.cleanupHars[0].path,'utf8')).log.entries[0].fixture,501);
  await cleanup({job_id:first.job_id});assert.deepEqual(closed,[501]);assert.equal(stops,2);
  const third=await start();await finished(third);assert.equal(created,3);assert.ok(tabs.has(502));
  await cleanup({job_id:second.job_id});
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('a recovered explorer cleanup error does not retain admission after all owned tabs close',async()=>{
 const tools=new Map(),chain={};for(const name of ['int','positive','optional','default','url','min','max','uuid'])chain[name]=()=>chain;
 const z={number:()=>chain,string:()=>chain,boolean:()=>chain};const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-recovered-explorer-'));let explorations=0;
 registerFuzzerTools({register:(name,d,s,r,fn)=>tools.set(name,fn),z,text:v=>v,artifactDir:dir,controller:{},
  explorerFactory:async(controller,{onOwnedTab,onClosedTab})=>{
   const id=601+explorations++;onOwnedTab(id);onClosedTab(id);
   return {status:'PARTIAL',actions:1,nodes:[],edges:[],pending:[],cleanupError:'transient cleanup failure',retainedTabIds:[],cleanupPending:false};
  }});
 const start=()=>tools.get('pragmatic_explore_start')({game_url:'https://www.pragmaticplay.fun/en/slots/demo/',max_actions:1,max_depth:1,timeout_ms:10000});
 const finish=async job=>{for(let i=0;i<100;i++){const r=await tools.get('pragmatic_explore_result')({job_id:job.job_id});if(r.status!=='RUNNING'&&r.cleanupPending!==undefined){await new Promise(resolve=>setTimeout(resolve,5));return r;}await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('explorer did not finish');};
 try{
  const first=await finish(await start()),second=await finish(await start());
  assert.equal(first.cleanupPending,false);assert.equal(second.cleanupPending,false);
  await finish(await start());assert.equal(explorations,3);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('tool registrations share admission and retained cleanup only for the same controller',async()=>{
 const chain={};for(const name of ['int','positive','optional','default','url','min','max','uuid'])chain[name]=()=>chain;
 const z={number:()=>chain,string:()=>chain,boolean:()=>chain};const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-shared-controller-'));
 let created=0,allowClose=false;const controller={tabs:{resolve:()=>({})}},otherController={tabs:{resolve:()=>({})}};
 const register=controller=>{
  const tools=new Map();registerFuzzerTools({register:(name,d,s,r,fn)=>tools.set(name,fn),z,text:v=>v,artifactDir:dir,controller,
   sessionFactory:async(c,{onOwnedTab,onClosedTab})=>{
    const id=701+created++,cleanup=async()=>{if(!allowClose)throw new Error('retained cleanup');onClosedTab(id);};onOwnedTab(id,cleanup);
    return {tabId:id,observe:async()=>{throw new Error('observation failed');},close:cleanup};
   }});return tools;
 };
 const a=register(controller),b=register(controller),other=register(otherController);
 const start=tools=>tools.get('pragmatic_fuzz_start')({tab_id:3,game_url:'https://www.pragmaticplay.fun/en/slots/demo/',execute:false});
 const read=(tools,id)=>tools.get('pragmatic_fuzz_result')({job_id:id,offset:0,limit:5,graph_offset:0,graph_limit:50});
 const finish=async(tools,job)=>{for(let i=0;i<100;i++){const r=await read(tools,job.job_id);if(r.artifact)return r;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('job did not finish');};
 const jobs=[];
 try{
  const first=await start(a);jobs.push([b,first]);await finish(b,first);
  const second=await start(b);jobs.push([a,second]);await finish(a,second);
  await assert.rejects(start(a),/2|Two/);assert.equal(created,2);
  const independent=await start(other);jobs.push([other,independent]);await finish(other,independent);assert.equal(created,3);
  allowClose=true;await b.get('pragmatic_fuzzer_cleanup')({job_id:first.job_id});
  assert.equal((await read(a,first.job_id)).cleanupPending,false);
  const third=await start(a);jobs.push([b,third]);await finish(b,third);assert.equal(created,4);
 }finally{allowClose=true;for(const [tools,job] of jobs){await finish(tools,job);await tools.get('pragmatic_fuzzer_cleanup')({job_id:job.job_id});}await fs.rm(dir,{recursive:true,force:true});}
});

test('MCP preserves startup evidence and reports screenshot failures without hiding the original error',async()=>{
 const chain={};for(const name of ['int','positive','optional','default','url','min','max','uuid'])chain[name]=()=>chain;
 const z={number:()=>chain,string:()=>chain,boolean:()=>chain};
 const artifactDir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-evidence-test-'));
 for(const startup of [true,false]){
  const tools=new Map();let closed=false;
  const screenshot={path:'startup.jpg',mimeType:'image/jpeg',tabId:99,reason:'entry failed',branch:[]};
  registerFuzzerTools({register:(name,description,schema,readonly,callback)=>tools.set(name,callback),z,text:v=>v,artifactDir,
   controller:{tabs:{resolve:()=>({})}},sessionFactory:async(controller,options)=>{
    assert.equal(options.artifactDir,artifactDir);
    if(startup)throw Object.assign(new Error('entry failed'),{screenshot,har:{path:'startup.har'},cleanupError:'save failed'});
    return {observe:async()=>{throw new Error('observe failed');},captureFailure:async()=>{assert.equal(closed,false);throw new Error('capture failed');},close:async()=>{closed=true;}};
   }});
  const started=await tools.get('pragmatic_fuzz_start')({tab_id:9,game_url:'https://www.pragmaticplay.com/en/games/fixture/',execute:false});
  let result;for(let n=0;n<100;n++){result=await tools.get('pragmatic_fuzz_result')({job_id:started.job_id,offset:0,limit:5,graph_offset:0,graph_limit:50});if(result.artifact)break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(result.status,'ERROR');assert.equal(result.error,startup?'entry failed':'observe failed');
  if(startup){assert.deepEqual(result.screenshot,screenshot);assert.deepEqual(result.har,{path:'startup.har'});assert.equal(result.cleanupError,'save failed');}
  else{assert.match(result.screenshot.error,/capture failed/);assert.equal(closed,true);}
 }
});

test('MCP limits jobs to two (four loaded game tabs) and recovers slots only after cleanup',async()=>{
 const tools=new Map(),chain={};
 for(const name of ['int','positive','optional','default','url','min','max','uuid'])chain[name]=()=>chain;
 const z={number:()=>chain,string:()=>chain,boolean:()=>chain};
 const artifactDir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-concurrency-test-'));
 const pending=new Map();let releaseCleanup;
 const cleanupGate=new Promise(resolve=>{releaseCleanup=resolve;});
 registerFuzzerTools({register:(name,description,schema,readonly,callback)=>tools.set(name,callback),z,text:v=>v,artifactDir,
  controller:{tabs:{resolve:()=>({})}},sessionFactory:async(controller,{gameUrl})=>{
   let release;const gate=new Promise(resolve=>{release=resolve;});pending.set(gameUrl,release);
   return {observe:async()=>{const fail=await gate;if(fail)throw new Error('fixture observation failed');return {phase:'base',terminal:true,inventoryKnown:true,options:[{id:gameUrl,kind:'buy',index:0}]};},
    probeBet:async()=>({status:'PENDING',restored:true,reason:'PROBE_PENDING',before:{bet:2,options:[]}}),
    close:async()=>{if(gameUrl.endsWith('fixture-12/'))await cleanupGate;},har:{fixture:gameUrl}};
  }});
 const start=tab_id=>tools.get('pragmatic_fuzz_start')({tab_id,game_url:`https://www.pragmaticplay.com/en/games/fixture-${tab_id}/`,execute:false});
 const read=job_id=>tools.get('pragmatic_fuzz_result')({job_id,offset:0,limit:5,graph_offset:0,graph_limit:50});
 const finish=async(job,fail=false)=>{
  pending.get(`https://www.pragmaticplay.com/en/games/fixture-${job.source_tab_id}/`)(fail);
  for(let n=0;n<100;n++){const result=await read(job.job_id);if(result.status!=='RUNNING'&&result.artifact)return result;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.fail('job did not finish');
 };
 const active=[];
 try{
  for(let id=11;id<=12;id++)active.push(await start(id));
  assert.equal(new Set(active.map(job=>job.job_id)).size,2);
  await assert.rejects(start(16),/2.*running|running.*2/i);
  for(const job of active)assert.equal((await read(job.job_id)).status,'RUNNING');
  await assert.rejects(tools.get('pragmatic_fuzzer_cleanup')({job_id:active[0].job_id}),/still running/);
  const first=await finish(active[0]);
  assert.equal(first.result.inventory[0].id,'https://www.pragmaticplay.com/en/games/fixture-11/');
  assert.equal(first.har.fixture,'https://www.pragmaticplay.com/en/games/fixture-11/');
  active.push(await start(16));
  pending.get('https://www.pragmaticplay.com/en/games/fixture-12/')(true);
  for(let n=0;n<100&&(await read(active[1].job_id)).status==='RUNNING';n++)await new Promise(resolve=>setTimeout(resolve,10));
  await assert.rejects(start(17),/2.*running|running.*2/i);
  releaseCleanup();
  const failed=await finish(active[1],true);
  assert.equal(failed.status,'ERROR');assert.match(failed.error,/observation failed/);assert.equal(failed.result,undefined);
  active.push(await start(17));
  for(const job of active.slice(2)){
   const result=await finish(job);
   assert.equal(result.source_tab_id,job.source_tab_id);
   assert.equal(result.result.inventory[0].id,`https://www.pragmaticplay.com/en/games/fixture-${job.source_tab_id}/`);
   assert.equal(result.har.fixture,`https://www.pragmaticplay.com/en/games/fixture-${job.source_tab_id}/`);
  }
 }finally{
  releaseCleanup();for(const release of pending.values())release();
  for(const job of active){for(let n=0;n<100&&(await read(job.job_id)).status==='RUNNING';n++)await new Promise(resolve=>setTimeout(resolve,10));}
 }
});

test('MCP retains known purchases without executing branches after an unfinished bet probe',async()=>{
 const tools=new Map(),chain={};
 for(const name of ['int','positive','optional','default','url','min','max','uuid'])chain[name]=()=>chain;
 const z={number:()=>chain,string:()=>chain,boolean:()=>chain};
 const artifactDir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-probe-test-'));
 let forked=false,closed=false;
 const screenshot={path:'fixture-probe.jpg',mimeType:'image/jpeg',tabId:31,reason:'PROBE_SPINS_NOT_COMPLETED'};
 registerFuzzerTools({register:(name,description,schema,readonly,callback)=>tools.set(name,callback),z,text:v=>v,artifactDir,
  controller:{tabs:{resolve:()=>({})}},sessionFactory:async()=>({
   observe:async()=>({phase:'base',terminal:true,inventoryKnown:true,options:[{id:'buy_feature:0',kind:'buy',index:0},{id:'buy_feature:1',kind:'buy',index:1}]}),
   probeBet:async()=>({status:'PENDING',restored:true,reason:'PROBE_SPINS_NOT_COMPLETED',before:{bet:2,options:[]}}),
   captureFailure:async()=>{assert.equal(closed,false);return screenshot;},
   forkDemo:async()=>{forked=true;throw new Error('Probe must finish before purchases');},close:async()=>{closed=true;}
  })});
 const started=await tools.get('pragmatic_fuzz_start')({tab_id:3,game_url:'https://www.pragmaticplay.com/en/games/helios-triple-sun/',execute:true,max_steps:100,timeout_ms:180000});
 let result;for(let n=0;n<100;n++){result=await tools.get('pragmatic_fuzz_result')({job_id:started.job_id,offset:0,limit:5,graph_offset:0,graph_limit:50});if(result.status!=='RUNNING'&&result.artifact)break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(result.status,'PARTIAL');assert.equal(result.result.buyFeaturePresence,'PRESENT');assert.equal(result.result.inventory.length,2);
 assert.equal(result.result.graph.nodes.filter(n=>n.kind==='buy'&&n.status==='UNTESTED').length,2);
 assert.equal(result.result.coverage.graphComplete,false);assert.equal(forked,false);assert.equal(closed,true);
 assert.deepEqual(result.screenshot,screenshot);
});
