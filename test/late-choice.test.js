import test from 'node:test';
import assert from 'node:assert/strict';
import {runPragmatic} from '../providers/pragmatic/flow.js';

const buy={id:'buy_feature:0',kind:'buy'};
const picks=Array.from({length:3},(_,index)=>({id:`pick:${index}`,kind:'pick',active:true,index}));
const base={phase:'base',terminal:true,inventoryKnown:true,options:[]};
const pending={phase:'feature',terminal:false,options:[],continueAction:{id:'protocol:continue',kind:'continue'}};
function session({natural=false,unchanged=false,declinedKind='continue',active=true,lateEveryFork=false,choiceCount=3}={}){
 const picks=Array.from({length:choiceCount},(_,index)=>({id:`pick:${index}`,kind:'pick',active:true,index}));
 const forks=[];
 return {forks,observe:async()=>({...base,options:[buy]}),forkDemo:async()=>{
  let stage='entry',verified=false;const actions=[];const late=lateEveryFork||forks.length===0;forks.push(actions);
  return {observe:async()=>stage==='entry'?{...base,options:[buy]}:stage==='pending'?{...pending,continueAction:{...pending.continueAction,kind:declinedKind}}:stage==='menu'?{phase:'choice',terminal:false,options:picks}:base,
   perform:async action=>{actions.push(action);if(action.kind==='buy'){if(declinedKind==='buy')return {ok:false,needsSelection:true,choices:picks};stage=natural?'base':late?'pending':'menu';return {ok:true};}
    if(action.kind===declinedKind){if(!unchanged)stage='menu';return {ok:false,needsSelection:true,kind:'bonus-pick',choices:picks.map(p=>({...p,active}))};}
    stage='base';return {ok:true};},capture:async()=>({}),waitForTransition:async()=>true,
   verifyBase:async()=>{if(natural&&!verified){verified=true;stage='pending';return false;}return true;},close:async()=>{}};
 }};
}
test('replay waits through continuation until its planned choice appears on every fork',async()=>{
 const s=session({lateEveryFork:true});const r=await runPragmatic(s,{maxSteps:8});
 assert.equal(r.status,'COMPLETE');
 for(const actions of s.forks)assert.equal(actions.filter(a=>a.kind==='buy').length,1);
 assert.deepEqual(s.forks.slice(1).map(actions=>actions.filter(a=>a.kind==='pick').map(a=>a.id)),picks.map(p=>[p.id]));
});
test('late advertised bonus choices expand the graph and replay each leaf in its own fork',async()=>{
 const s=session();const r=await runPragmatic(s,{maxSteps:8});
 assert.equal(r.status,'COMPLETE');assert.equal(r.tree[0].status,'EXPANDED');
 assert.deepEqual(r.tree.slice(1).map(b=>b.path),picks.map(p=>[buy.id,p.id]));
 assert.equal(s.forks.length,4);
 for(const actions of s.forks)assert.equal(actions.filter(a=>a.kind==='buy').length,1);
 assert.equal(s.forks[0].filter(a=>a.kind==='pick').length,0);
 assert.deepEqual(s.forks.slice(1).map(actions=>actions.filter(a=>a.kind==='pick').map(a=>a.id)),picks.map(p=>[p.id]));
});
test('a purchase with seven advertised choices executes all seven independent graph leaves',async()=>{
 const s=session({choiceCount:7,lateEveryFork:true});const r=await runPragmatic(s,{maxSteps:8});
 assert.equal(r.status,'COMPLETE');assert.equal(r.tree.length,8);
 assert.equal(r.tree.filter(b=>b.status==='COMPLETE').length,7);
 assert.equal(new Set(r.tree.slice(1).map(b=>b.path[1])).size,7);
 for(const actions of s.forks)assert.equal(actions.filter(a=>a.kind==='buy').length,1);
});
test('late natural verification choices remain nonreplayable',async()=>{
 const s=session({natural:true});const r=await runPragmatic(s,{maxSteps:8});
 assert.equal(r.tree[0].reason,'NATURAL_BONUS_CHOICE_REQUIRED');assert.equal(r.tree.length,1);
 assert.equal(r.graph.nodes.some(n=>n.kind==='pick'),false);assert.equal(s.forks[0].filter(a=>a.kind==='buy').length,1);
});
test('unchanged late choice observations are bounded by the existing step budget',async()=>{
 const r=await runPragmatic(session({unchanged:true}),{maxSteps:4});
 assert.equal(r.status,'PARTIAL');assert.equal(r.tree[0].reason,'STEP_LIMIT');assert.equal(r.tree[0].steps.length,4);
});
test('failed purchase and inactive advertised choices still fail without retry',async()=>{
 for(const options of [{declinedKind:'buy'},{active:false}]){
  const r=await runPragmatic(session(options),{maxSteps:4});
  assert.equal(r.tree[0].reason,'ACTION_FAILED');
 }
});
