import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {registerFuzzerTools} from '../integrations/hardfire/mcp-tools.js';

test('MCP retains known purchases without executing branches after an unfinished bet probe',async()=>{
 const tools=new Map(),chain={};
 for(const name of ['int','positive','optional','default','url','min','max','uuid'])chain[name]=()=>chain;
 const z={number:()=>chain,string:()=>chain,boolean:()=>chain};
 const artifactDir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-probe-test-'));
 let forked=false,closed=false;
 registerFuzzerTools({register:(name,description,schema,readonly,callback)=>tools.set(name,callback),z,text:v=>v,artifactDir,
  controller:{tabs:{resolve:()=>({})}},sessionFactory:async()=>({
   observe:async()=>({phase:'base',terminal:true,inventoryKnown:true,options:[{id:'buy_feature:0',kind:'buy',index:0},{id:'buy_feature:1',kind:'buy',index:1}]}),
   probeBet:async()=>({status:'PENDING',restored:true,reason:'PROBE_SPINS_NOT_COMPLETED',before:{bet:2,options:[]}}),
   forkDemo:async()=>{forked=true;throw new Error('Probe must finish before purchases');},close:async()=>{closed=true;}
  })});
 const started=await tools.get('pragmatic_fuzz_start')({tab_id:3,game_url:'https://www.pragmaticplay.com/en/games/helios-triple-sun/',execute:true,max_steps:100,timeout_ms:180000});
 let result;for(let n=0;n<100;n++){result=await tools.get('pragmatic_fuzz_result')({job_id:started.job_id,offset:0,limit:5,graph_offset:0,graph_limit:50});if(result.status!=='RUNNING'&&result.artifact)break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(result.status,'PARTIAL');assert.equal(result.result.buyFeaturePresence,'PRESENT');assert.equal(result.result.inventory.length,2);
 assert.equal(result.result.graph.nodes.filter(n=>n.kind==='buy'&&n.status==='UNTESTED').length,2);
 assert.equal(result.result.coverage.graphComplete,false);assert.equal(forked,false);assert.equal(closed,true);
});
