import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {registerFuzzerTools} from '../integrations/hardfire/mcp-tools.js';

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
