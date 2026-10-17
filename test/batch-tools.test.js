import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {registerBatchTools} from '../integrations/hardfire/batch-tools.js';

test('batch scheduler processes exactly 600 demos with max two workers and bounded sessions',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-600-test-'));
 const jobs=new Map(),activeJobs=new Set(),tools=new Map(),chain={};
 for(const prop of ['int','positive','optional','default','url','min','max','uuid'])chain[prop]=()=>chain;
 const z={number:()=>chain,string:()=>chain,boolean:()=>chain,array:()=>chain};
 let inFlight=0,highWater=0,calls=0;
 const runGame=async(controller,args)=>{
  assert.equal(args.mode,'batch');assert.equal(args.maxSessions,4);
  inFlight++;highWater=Math.max(highWater,inFlight);calls++;
  await Promise.resolve(); // Permit the second worker to overlap.
  inFlight--;
  return {status:'TARGETS_EXHAUSTED',actions:3,sessions:1,verifiedPurchases:2,
   pending:[],ignored:[],nodes:[],edges:[],completeGame:false};
 };
 registerBatchTools({register:(name,description,schema,readOnly,callback)=>tools.set(name,callback),
  z,text:x=>x,controller:{},artifactDir:base,activeJobs,jobs,runGame});
 const urls=Array.from({length:600},(_,i)=>'https://www.pragmaticplay.fun/en/slots/fixture-'+i+'/');
 const started=await tools.get('pragmatic_batch_start')({game_urls:urls,sessions_per_game:4,actions_per_game:30,
  depth:6,timeout_ms_per_game:300000,concurrency:2});
 let result;
 for(let n=0;n<300;n++){
  result=await tools.get('pragmatic_batch_result')({job_id:started.job_id,offset:590,limit:20});
  if(result.status!=='RUNNING')break;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 assert.equal(result.status,'FINISHED');
 assert.equal(calls,600);assert.equal(result.completed,600);assert.equal(result.total,600);
 assert.equal(result.failed,0);assert.equal(result.verifiedPurchases,1200);
 assert.equal(result.sessionsUsed,600);assert.equal(highWater,2);
 assert.equal(result.results.length,10);assert.equal(result.next_offset,null);
 const saved=JSON.parse(await fs.readFile(result.artifact,'utf8'));
 assert.equal(saved.completed,600);assert.equal(saved.results[599].index,600);
 assert.equal(activeJobs.size,0);
});

test('batch rejects unsafe URL before allocating a job',async()=>{
 const jobs=new Map(),activeJobs=new Set(),tools=new Map(),chain={};
 for(const prop of ['int','positive','optional','default','url','min','max','uuid'])chain[prop]=()=>chain;
 const z={number:()=>chain,string:()=>chain,boolean:()=>chain,array:()=>chain};
 registerBatchTools({register:(name,d,s,r,callback)=>tools.set(name,callback),
  z,text:x=>x,controller:{},artifactDir:os.tmpdir(),activeJobs,jobs,runGame:async()=>{throw Error('must not run')}});
 await assert.rejects(()=>tools.get('pragmatic_batch_start')({game_urls:[
  'https://www.pragmaticplay.fun/en/slots/fixture/',
  'https://some-real-casino.example.com/?token=secret'
 ],sessions_per_game:4,actions_per_game:5,depth:2,timeout_ms_per_game:10000,concurrency:1}));
 assert.equal(jobs.size,0);assert.equal(activeJobs.size,0);
});
