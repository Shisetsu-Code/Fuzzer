import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {registerTreeTools} from '../integrations/hardfire/forked-tree-tools.js';

test('MCP forked tree: observe, approve four branches, dispatch, persist, release ownership',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-tree-mcp-'));
 const methods=new Map(),activeJobs=new Set(),chain={};
 for(const name of ['int','positive','optional','default','url','min','max','uuid'])chain[name]=()=>chain;
 const z={string:()=>chain,number:()=>chain,array:()=>chain};
 const control=key=>({key,name:key,labels:[key],fingerprint:'fp-'+key,hit_rect:{x:0,y:0,width:10,height:10}});
 let open=0,peak=0,next=0,created=0,clicks=[];
 const adapterFactory=()=>{
  const tab=++created;let state='root',sequence=0,released=false;
  return {adapter:{
   reset:async()=>{open++;peak=Math.max(open,peak);state='root';sequence=0;},
   snapshot:async()=>({key:state,controls:state==='root'?[control('open')]:
    state==='menu'?[control('buy0'),control('buy1'),control('buy2'),control('buy3')]:[],
    operation:{sequence},evidence:{tab_id:tab}}),
   click:async b=>{clicks.push(b.key);if(b.key==='open')state='menu';else {state='bonus';sequence++;}},
   operationStarted:(a,b)=>(b.operation?.sequence||0)>(a.operation?.sequence||0)
  },cleanup:async()=>{if(!released){released=true;open--;}}};
 };
 registerTreeTools({register:(n,d,s,ro,fn)=>methods.set(n,fn),z,text:x=>x,
  controller:{},artifactDir:dir,activeJobs,adapterFactory,
  transition:async(a,b)=>{await new Promise(r=>setTimeout(r,4));return {snapshot:await a.snapshot(),reason:'STATE_CHANGED'};}});
 const start=await methods.get('pragmatic_tree_start')({game_url:'https://www.pragmaticplay.fun/en/slots/fixture/',clients:4,max_sessions:12,max_depth:4});
 assert.equal(start.status,'AWAITING_APPROVAL');assert.equal(activeJobs.size,1);
 const read=()=>methods.get('pragmatic_tree_result')({job_id:start.job_id});
 const root=(await read()).graph.nodes[0];
 await methods.get('pragmatic_tree_approve')({job_id:start.job_id,node_id:root.id,control_keys:['open']});
 await methods.get('pragmatic_tree_run')({job_id:start.job_id});
 let state;
 for(let i=0;i<150;i++){
  state=await read();if(state.status!=='RUNNING')break;await new Promise(r=>setTimeout(r,10));
 }
 assert.equal(state.status,'AWAITING_APPROVAL');
 const menu=state.graph.nodes.find(n=>n.route.length===1);
 assert.deepEqual(menu.controls.map(o=>o.key),['buy0','buy1','buy2','buy3']);
 await methods.get('pragmatic_tree_approve')({job_id:start.job_id,node_id:menu.id,control_keys:menu.controls.map(c=>c.key)});
 await methods.get('pragmatic_tree_run')({job_id:start.job_id});
 for(let i=0;i<150;i++){
  state=await read();if(state.status!=='RUNNING')break;await new Promise(r=>setTimeout(r,10));
 }
 assert.equal(state.status,'AWAITING_APPROVAL');
 assert.equal(state.graph.peakParallel,4);
 assert.equal(state.graph.events.filter(e=>e.operationStarted).length,4);
 assert.equal(open,0);assert.equal(activeJobs.size,1);
 assert.equal(clicks.filter(c=>c.startsWith('buy')).length,4);
 const saved=JSON.parse(await fs.readFile(start.artifact,'utf8'));
 assert.equal(saved.graph.events.filter(e=>e.operationStarted).length,4);
 const closed=await methods.get('pragmatic_tree_close')({job_id:start.job_id});
 assert.equal(closed.status,'CLOSED');assert.equal(activeJobs.size,0);
 assert.equal(open,0);
});

test('tree requires exclusive four-tab ownership before starting',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-tree-exclusivity-'));
 const methods=new Map(),activeJobs=new Set(['other-fuzzer']),chain={};
 for(const name of ['int','positive','optional','default','url','min','max','uuid'])chain[name]=()=>chain;
 const z={string:()=>chain,number:()=>chain,array:()=>chain};
 registerTreeTools({register:(n,d,s,ro,fn)=>methods.set(n,fn),z,text:x=>x,
  controller:{},artifactDir:dir,activeJobs,
  adapterFactory:()=>{throw Error('SHOULD_NOT_OPEN_BROWSER');},
  transition:async()=>{throw Error('SHOULD_NOT_WAIT');}});
 await assert.rejects(()=>methods.get('pragmatic_tree_start')({
  game_url:'https://www.pragmaticplay.fun/en/slots/fixture/',clients:4,max_sessions:12,max_depth:4
 }),/Another Fuzzer job/);
});
