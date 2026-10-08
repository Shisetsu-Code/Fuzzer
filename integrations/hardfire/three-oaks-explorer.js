import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {exploreStates,waitTransition} from '../../providers/pragmatic/state-explorer.js';
import {filterThreeOaksControls,assertThreeOaksDemoUrl} from '../../providers/three-oaks/discovery.js';
import {readThreeOaksOperations} from '../../providers/three-oaks/protocol.js';
import {createThreeOaksSession} from './three-oaks-session.js';
import {consolidateHars} from './har-consolidation.js';
/** Same BFS engine as Pragmatic, with provider-specific discovery and validation. */
export async function runThreeOaksExplorer(controller,{gameUrl,artifactDir,maxActions=20,maxDepth=4,timeoutMs=600000,onProgress,sessionFactory=createThreeOaksSession,waitOptions={}}={}){
 assertThreeOaksDemoUrl(gameUrl);let session;const saved=[],deadline=Date.now()+timeoutMs;
 const close=async()=>{if(!session)return;const owned=session;await owned.close();if(owned.har?.path)saved.push(owned.har.path);session=null;};
 const adapter={now:()=>Date.now(),sleep:ms=>new Promise(r=>setTimeout(r,ms)),reset:async()=>{await close();if(Date.now()>=deadline)throw Error('DEADLINE');session=await sessionFactory(controller,{gameUrl,artifactDir,deadline:Math.min(deadline,Date.now()+45000)});},
 snapshot:async()=>{
  const raw=await session.scan(),partition=filterThreeOaksControls(raw.controls||[]),operation=readThreeOaksOperations(await session.entries());
  const continuationSpin=operation.sequence>0&&!operation.baseTerminal&&operation.context?.round_finished===false&&operation.context?.actions?.some(action=>action!=='spin'&&action!=='buy_spin')?partition.discarded.filter(c=>c.semantic==='spin'||c.runtime_base_kind==='spin'):[];
  const controls=[...partition.keep,...continuationSpin].map(c=>({...c,key:c.path})),configuration={paths:controls.map(c=>({path:c.path,active:c.active})),anteBet:raw.anteBet,menuOpen:raw.menuOpen,current:operation.context?.current,actions:operation.context?.actions};
  const key=createHash('sha256').update(JSON.stringify(configuration)).digest('hex').slice(0,20);
  return {key,controls,allControls:raw.controls||[],unresolved:filterThreeOaksControls(raw.unresolved||[]).keep,operation,anteBet:raw.anteBet,menuOpen:raw.menuOpen,traffic:operation.sequence,evidence:{tab_id:session.tabId,provider:'three_oaks',runtime_observed:true,occlusion_verified:false}};
 },click:async control=>session.click(control),
 operationStarted:(before,after)=>after.operation.operations.some(o=>o.sequence>before.operation.sequence&&['purchase','spin','antebet'].includes(o.kind)),
 finishOperation:async(before,after,{choicePlan=[]}={})=>{
  let started=after.operation.operations.find(o=>o.sequence>before.operation.sequence&&['purchase','spin','antebet'].includes(o.kind));
  if(!started||!started.accepted&&!started.pending)return {ok:false,kind:started?.kind||'unknown',reason:started?.reason||'ACKNOWLEDGMENT_UNVERIFIED',snapshot:after};
  const decisions=[],visited=new Set();let current=after,lastTraffic=Date.now(),sequence=after.operation.sequence;let end=Math.min(deadline,Date.now()+(waitOptions.activeMs??60000));
  while(Date.now()<end){
   started=current.operation.operations.find(o=>o.sequence===started.sequence)||started;
   const failures=current.operation.operations.filter(o=>o.sequence>=started.sequence&&!o.accepted&&!o.pending);if(failures.length)return {ok:false,kind:started.kind==='antebet'?'spin':started.kind,modifier:started.kind==='antebet'?'antebet':null,reason:failures[0].reason,decisions,snapshot:current};
   if(started.accepted&&current.operation.baseTerminal)return {ok:true,kind:started.kind==='antebet'?'spin':started.kind,modifier:started.kind==='antebet'?'antebet':null,reason:'VERIFIED_RETURN_TO_BASE',decisions,request:{action:started.action,params:started.params},snapshot:current};
   // Let automatic feature animations progress before exploring observed controls.
   if(current.operation.sequence!==sequence){sequence=current.operation.sequence;lastTraffic=Date.now();end=Math.min(deadline,Date.now()+(waitOptions.activeMs??60000));}
   const candidates=current.operation.operations.some(o=>o.pending)?[]:current.controls.filter(c=>!visited.has(JSON.stringify([current.key,c.key,sequence])));
   if(candidates.length&&Date.now()-lastTraffic>=(waitOptions.quietMs??5000)){
    const wanted=choicePlan[decisions.length],choice=wanted?candidates.find(c=>c.key===wanted):candidates[0];
    if(!choice)return {ok:false,kind:started.kind==='antebet'?'spin':started.kind,modifier:started.kind==='antebet'?'antebet':null,reason:'CHOICE_REPLAY_MISMATCH',decisions,snapshot:current};
    visited.add(JSON.stringify([current.key,choice.key,sequence]));
    await session.click(choice);decisions.push({selected:choice.key,options:candidates.map(c=>({key:c.key}))});lastTraffic=Date.now();
   }
   await adapter.sleep(waitOptions.pollMs??500);current=await adapter.snapshot();
  }
  return {ok:false,kind:started.kind==='antebet'?'spin':started.kind,modifier:started.kind==='antebet'?'antebet':null,reason:'OPERATION_COMPLETION_UNVERIFIED',decisions,snapshot:current};
 },afterAction:async(before,after)=>{
  if(after.anteBet===null||after.anteBet===undefined||after.anteBet===before.anteBet||after.menuOpen===true||!after.operation.baseTerminal)return null;
  const spin=after.allControls.find(c=>c.semantic==='spin'||c.runtime_base_kind==='spin');if(!spin)return {performed:false,reason:'NORMAL_SPIN_CONTROL_UNVERIFIED'};
  const entryCountBefore=(await session.entries()).length;await session.click(spin);return {performed:true,kind:'ONE_NORMAL_DEMO_SPIN',entryCountBefore};
 },probeResult:async followup=>{const result=readThreeOaksOperations(await session.entries());return {classification:result.operations.find(o=>o.index>=followup.entryCountBefore&&o.action==='spin'&&o.accepted)?.kind||'UNKNOWN'};}};
 try{return {provider:'three_oaks',...await exploreStates(adapter,{maxActions,maxDepth,deadline,onProgress,wait:(a,b)=>waitTransition(a,b,{...waitOptions,activeMs:Math.min(waitOptions.activeMs??60000,Math.max(0,deadline-Date.now()))})})};}
 finally{await close();if(saved.length){const combinedPath=await consolidateHars(saved,artifactDir);await fs.writeFile(path.join(artifactDir,'har-reference.json'),JSON.stringify({path:combinedPath}));}}
}