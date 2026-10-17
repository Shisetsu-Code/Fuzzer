import test from 'node:test';
import assert from 'node:assert/strict';
import {createForkTree,branchId} from '../providers/pragmatic/forked-tree.js';

const c=key=>({key,name:key,labels:[key],fingerprint:'fp-'+key,
 hit_rect:{x:0,y:0,width:10,height:10}});
function fixture({failure=null,nested=true,latencyMs=3}={}){
 let sessions=0,active=0,peak=0;
 const clicked=[],resets=[],closes=[];
 const makeSession=async()=>{
  const id=++sessions;active++;peak=Math.max(peak,active);let state='root',sequence=0,disposed=false;
  return {
   reset:async()=>{state='root';sequence=0;resets.push(id);},
   snapshot:async()=>({key:state,controls:state==='root'?[c('open')]:
    state==='menu'?[c('buy0'),c('buy1'),c('buy2'),c('buy3')]:
    state==='nested'?[c('choiceA'),c('choiceB')]:[],
    operation:{sequence},evidence:{tab_id:id,capture_id:'cap-'+id}}),
   click:async b=>{
    clicked.push({id,state,key:b.key});
    if(failure&&failure({id,state,key:b.key}))throw Error('MOCK_FAILED');
    if(state==='root'&&b.key==='open')state='menu';
    else if(state==='menu'&&b.key==='buy2'&&nested)state='nested';
    else if(state==='menu'){state='bonus';sequence++;}
    else if(state==='nested'){state='bonus';sequence++;}
   },
   operationStarted:(before,after)=>(after.operation?.sequence||0)>(before.operation?.sequence||0),
   close:async()=>{if(!disposed){disposed=true;active--;closes.push(id);}},
   get id(){return id;}
  };
 };
 const wait=async(s)=>{
  await new Promise(resolve=>setTimeout(resolve,latencyMs));
  return {snapshot:await s.snapshot(),reason:'STATE_CHANGED'};
 };
 return {makeSession,wait,metrics:()=>({sessions,active,peak,clicked,resets,closes})};
}
const child=(tree,id,key)=>tree.nodes.find(n=>n.route.at(-1)?.key===key&&(!id||n.route.length===id));
test('four approved buys fork into 4 isolated clients with independent HAR identities',async()=>{
 const f=fixture({nested:false,latencyMs:15});
 const tree=createForkTree({...f,maxParallel:4,maxSessions:20});
 const init=await tree.initialize();
 assert.equal(init.nodes.length,1);assert.equal(f.metrics().active,0);
 const root=init.nodes[0];
 tree.approve(root.id,['open']);
 let r=await tree.run();
 assert.equal(r.nodes.length,2);
 const menu=child(r,1,'open');
 assert.equal(menu.controls.length,4);
 assert.equal(r.events.filter(e=>e.status==='DISCOVERED').length,1);
 tree.approve(menu.id,menu.controls.map(o=>o.key));
 r=await tree.run();
 assert.equal(r.events.filter(e=>e.status==='OPERATION_STARTED_NEEDS_GUIDED_COMPLETION').length,4);
 assert.equal(r.peakParallel,4);
 assert.equal(f.metrics().active,0);
 assert.equal(f.metrics().sessions,6); // discover+open+4 branches
 assert.equal(f.metrics().closes.length,6);
 assert.equal(f.metrics().clicked.filter(x=>x.key==='open').length,5);
 assert(r.nodes.every(n=>n.route.every(step=>step.from&&step.to)));
 assert.equal(r.complete,false);
});
test('a branch may reveal nested children; agent approves only observed next actions',async()=>{
 const f=fixture();
 const tree=createForkTree({...f,maxParallel:4});
 const root=(await tree.initialize()).nodes[0];
 tree.approve(root.id,['open']);let r=await tree.run();
 const menu=child(r,1,'open');
 tree.approve(menu.id,['buy2']);r=await tree.run();
 const nestedNode=child(r,2,'buy2');
 assert(nestedNode);assert.deepEqual(nestedNode.controls.map(c=>c.key),['choiceA','choiceB']);
 assert.equal(r.events.filter(e=>e.operationStarted).length,0);
 assert.equal(f.metrics().clicked.filter(x=>x.key.startsWith('choice')).length,0);
 tree.approve(nestedNode.id,['choiceA','choiceB']);
 r=await tree.run();
 assert.equal(r.events.filter(e=>e.operationStarted).length,2);
 assert.equal(r.nodes.length,3);
 assert.equal(f.metrics().active,0);
});
test('unknown, ambiguous and duplicate control approvals fail without clicking',async()=>{
 const f=fixture();const tree=createForkTree({...f});
 const root=(await tree.initialize()).nodes[0];
 assert.throws(()=>tree.approve(root.id,['invented']),/UNKNOWN/);
 assert.throws(()=>tree.approve(root.id,['open','open']),/DUPLICATE/);
 assert.equal(f.metrics().clicked.length,0);
 tree.decline(root.id,['open']);
 assert.throws(()=>tree.approve(root.id,['open']),/UNKNOWN/);
});
test('replay mismatch never clicks target or fabricates a node',async()=>{
 const f=fixture({failure:({id,key})=>id>2&&key==='open'});
 const tree=createForkTree({...f,maxParallel:2,maxSessions:8});
 const root=(await tree.initialize()).nodes[0];
 tree.approve(root.id,['open']);let r=await tree.run();
 const menu=child(r,1,'open');
 tree.approve(menu.id,['buy0','buy1']);
 r=await tree.run();
 assert.equal(r.errors.length,2);
 assert.equal(f.metrics().clicked.filter(x=>x.key.startsWith('buy')).length,0);
 assert.equal(f.metrics().active,0);
 assert.equal(r.nodes.length,2);
});
test('session budget and no automatic unapproved actions',async()=>{
 const f=fixture({nested:false});
 const tree=createForkTree({...f,maxParallel:4,maxSessions:2});
 const root=(await tree.initialize()).nodes[0];
 assert.equal(f.metrics().clicked.length,0);
 tree.approve(root.id,['open']);let r=await tree.run();
 const menu=child(r,1,'open');tree.approve(menu.id,menu.controls.map(c=>c.key));
 r=await tree.run();
 assert(r.errors.some(e=>e.reason==='SESSION_BUDGET_EXHAUSTED'));
 assert.equal(f.metrics().sessions,2);
 assert.equal(f.metrics().active,0);
});
test('tree node IDs are stable paths, not reel RNG or transient tab IDs',()=>{
 const route=[{from:'root',key:'open',fingerprint:'fp-open',to:'menu'}];
 assert.equal(branchId(route),branchId(structuredClone(route)));
 assert.notEqual(branchId(route),branchId([...route,{from:'menu',key:'buy0',to:'bonus'}]));
});
