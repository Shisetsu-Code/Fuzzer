import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {registerGuidedTools} from '../integrations/hardfire/guided-tools.js';

test('guided MCP start, status, action, stale token and close require model decisions',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-guided-mcp-'));
 const tools=new Map(),activeJobs=new Set(),chain={};
 for(const key of ['int','positive','optional','default','url','min','max','uuid'])chain[key]=()=>chain;
 const z={number:()=>chain,string:()=>chain};
 let clicks=[],opens=0,closes=0,current='root';
 const makeAdapter=()=>({adapter:{
  reset:async()=>{opens++;current='root';},
  snapshot:async()=>({key:current,controls:current==='root'?[{key:'feature-menu',name:'Buy Feature',path:'Buy Feature',
   labels:[],handlers:[],fingerprint:'same',sprite_names:[]}]:[],choices:[],
   flags:{canSpin:true},wager:{menuOpen:false},operation:{sequence:0},
   evidence:{tab_id:123,full_path:'/mock/full.jpg'}}),
  click:async b=>{clicks.push(b.key);current='menu';}
 },cleanup:async()=>{closes++;return {har:'mock.har'};}});
 registerGuidedTools({register:(n,d,s,ro,callback)=>tools.set(n,callback),z,text:x=>x,
  controller:{},artifactDir:dir,activeJobs,adapterFactory:makeAdapter,
  transition:async a=>({snapshot:await a.snapshot(),reason:'STATE_CHANGED'})});
 const r=await tools.get('pragmatic_guided_start')({game_url:'https://www.pragmaticplay.fun/en/slots/fixture/',max_sessions:4});
 assert.equal(activeJobs.size,1);assert.equal(opens,1);assert.deepEqual(clicks,[]);
 const id=r.job_id,first=r.actions.find(a=>a.key==='feature-menu');
 const status=await tools.get('pragmatic_guided_status')({job_id:id});
 assert.equal(status.view.token,r.token);
 assert.equal((await tools.get('pragmatic_guided_act')({job_id:id,token:'bogus',action_id:first.action_id})).status,'STALE_DECISION');
 assert.deepEqual(clicks,[]);
 const next=await tools.get('pragmatic_guided_act')({job_id:id,token:r.token,action_id:first.action_id});
 assert.equal(next.status,'DECISION_EXECUTED');assert.deepEqual(clicks,['feature-menu']);
 assert.equal((await tools.get('pragmatic_guided_act')({job_id:id,token:r.token,action_id:first.action_id})).status,'STALE_DECISION');
 const closed=await tools.get('pragmatic_guided_close')({job_id:id});
 assert.equal(closed.status,'CLOSED');assert.equal(closes,1);assert.equal(activeJobs.size,0);
 const saved=JSON.parse(await fs.readFile(closed.artifact,'utf8'));
 assert.equal(saved.decisions.length,1);assert.equal(saved.cleanup.har,'mock.har');
});
