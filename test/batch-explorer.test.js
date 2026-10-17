import test from 'node:test';
import assert from 'node:assert/strict';
import {controlPriority,explorePurchaseBatch} from '../providers/pragmatic/batch-explorer.js';
const transition=async(a,before)=>({snapshot:await a.snapshot(),reason:'STATE_CHANGED'});
const c=(key,name=key)=>({key,name,path:name,labels:[],handlers:[]});

test('purchase-first: two buys and a nested menu are explored in ONE demo session',async()=>{
 let state='root',sequence=0,resets=0;
 const clicks=[];
 const controls={root:[c('open','Buy Feature')],menu:[c('close','Cancel'),c('b0','Buy Free Spins 80x'),c('b1','Buy Free Spins 200x'),c('sound','Music')]};
 const a={
  reset:async()=>{state='root';sequence=0;resets++},
  snapshot:async()=>({key:state,controls:controls[state]||[],operation:{sequence},traffic:sequence}),
  click:async b=>{clicks.push(b.key);if(b.key==='open')state='menu';if(b.key.startsWith('b')){state='bonus';sequence++;}},
  operationStarted:(b,s)=>s.operation.sequence>b.operation.sequence,
  finishOperation:async()=>{state='root';return {ok:true,kind:'purchase',normalSpinVerified:true,decisions:[],snapshot:await a.snapshot()}}
 };
 const r=await explorePurchaseBatch(a,{maxSessions:4,maxActions:10,wait:transition});
 assert.equal(r.status,'TARGETS_EXHAUSTED');assert.equal(resets,1);
 assert.equal(r.verifiedPurchases,2);assert.equal(r.sessions,1);
 assert.deepEqual(clicks,['open','b0','open','b1']);
 assert.equal(r.coverage.gameComplete,false);
 assert.equal(r.edges.filter(e=>e.operation?.ok).length,2);
 assert(r.ignored.some(e=>e.action==='close'));assert(r.ignored.some(e=>e.action==='sound'));
});
test('choice alternatives repeat a purchase but never require random reel replay',async()=>{
 let state='root',seq=0,resets=0;const chosen=[];
 const a={
  reset:async()=>{resets++;state='root';seq=0},
  snapshot:async()=>({key:state,controls:state==='root'?[c('buy','Buy Feature')]:[],operation:{sequence:seq}}),
  click:async()=>{state='random-bonus';seq++},
  operationStarted:(b,s)=>s.operation.sequence>b.operation.sequence,
  finishOperation:async(b,s,{choicePlan=[]}={})=>{
   const selected=choicePlan[0]||'a';chosen.push(selected);state='root';
   return {ok:true,kind:'purchase',snapshot:await a.snapshot(),decisions:[{options:[{key:'a'},{key:'b'}],selected}]};
  }
 };
 const r=await explorePurchaseBatch(a,{maxActions:5,wait:transition});
 assert.deepEqual(chosen,['a','b']);assert.equal(r.verifiedPurchases,2);
 assert.equal(resets,1);assert.equal(r.nodes.length,1);
 assert(r.edges.every(e=>e.to===null));
});
test('failed purchase requires a fresh session and never reuses stale bonus controls',async()=>{
 let state='root',sequence=0,resets=0;const clicks=[];
 const a={
  reset:async()=>{state='root';sequence=0;resets++},
  snapshot:async()=>({key:state,controls:state==='root'?[c('buy0','Buy Feature 0'),c('buy1','Buy Feature 1')]:[],operation:{sequence}}),
  click:async b=>{clicks.push(b.key);state='bonus';sequence++},
  operationStarted:(b,s)=>s.operation.sequence>b.operation.sequence,
  finishOperation:async()=>({ok:false,kind:'purchase',reason:'OPERATION_TIMEOUT',snapshot:await a.snapshot()})
 };
 const r=await explorePurchaseBatch(a,{maxActions:8,maxSessions:3,wait:transition});
 assert.deepEqual(clicks,['buy0','buy1']);assert.equal(resets,2);
 assert.equal(r.status,'PARTIAL');assert.equal(r.verifiedPurchases,0);
 assert.equal(r.pending.filter(x=>x.reason==='OPERATION_TIMEOUT').length,2);
});
test('respects strict session limit and records untested choices',async()=>{
 let state='root',sequence=0,resets=0;
 const a={
  reset:async()=>{resets++;state='root';sequence=0},
  snapshot:async()=>({key:state,controls:state==='root'?[c('b1','Buy 1'),c('b2','Buy 2'),c('b3','Buy 3')]:[],operation:{sequence}}),
  click:async()=>{state='bonus';sequence++},
  operationStarted:(b,s)=>s.operation.sequence>b.operation.sequence,
  finishOperation:async()=>({ok:false,kind:'purchase',reason:'STUCK',snapshot:await a.snapshot()})
 };
 const r=await explorePurchaseBatch(a,{maxSessions:1,maxActions:12,wait:transition});
 assert.equal(resets,1);assert.equal(r.edges.length,1);
 assert(r.pending.some(p=>p.reason==='SESSION_LIMIT'));
 assert.equal(r.coverage.targetsRemaining,1); // The second task is popped; third remains in queue.
});
test('unresolved drawings prevent a false clean coverage result',async()=>{
 const a={reset:async()=>{},snapshot:async()=>({key:'root',controls:[],unresolved:[{path:'unknown purchase',reason:'NOT_DRAWN'}]})};
 const r=await explorePurchaseBatch(a,{wait:transition});
 assert.equal(r.status,'PARTIAL');assert.equal(r.pending[0].reason,'UNRESOLVED_DRAWING');
});
test('control priority is conservative for generic UI and prefers buy over dismiss',async()=>{
 assert(controlPriority(c('x','Buy Feature'))>controlPriority(c('y','Open Options')));
 assert.equal(controlPriority(c('x','Cancel')),-1);
 assert.equal(controlPriority(c('z','Volume Button')),0);
 assert.equal(controlPriority({key:'buy',name:'ConfirmButton',path:'Game/Background/BuyFeature/ConfirmButton',labels:['BUY NOW']}),100);
 assert(controlPriority({key:'menu',name:'OpenCloseButton',path:'FeatureMenu/OpenCloseButton'})>0);
 await assert.rejects(()=>explorePurchaseBatch({},{maxSessions:5,wait:transition}),/maxSessions/);
});
