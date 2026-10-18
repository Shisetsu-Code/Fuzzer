/**
 * Deterministic, capture-driven breadth-first branch planner.
 * The agent approves controls; the scheduler only replays approved UI paths.
 * Each branch owns one isolated DEMO session and HAR. No replay of random RNG.
 */
import {createHash} from 'node:crypto';
import {createLiveBonusBranch} from './live-bonus-branch.js';

const id=route=>'route:'+createHash('sha256').update(JSON.stringify(route)).digest('hex').slice(0,20);
const clean=s=>String(s||'').slice(0,300);
export const branchId=id;
export function summarizeControls(snapshot){
 const seen=new Map();
 for(const c of snapshot.controls||[]){
  if(!c.hit_rect||!c.key)continue;
  const key=String(c.key),fingerprint=String(c.fingerprint||'');
  if(seen.has(key)){
   seen.get(key).ambiguous=true;
   continue;
  }
  seen.set(key,{key,name:c.name||'',labels:[...(c.labels||[])].slice(0,12),
   fingerprint,ambiguous:false,status:'UNTESTED'});
 }
 return [...seen.values()];
}

export function createForkTree({makeSession,wait,onProgress=async()=>{},
 maxParallel=4,maxSessions=40,maxDepth=8,deadline=Infinity}={}){
 if(typeof makeSession!=='function'||typeof wait!=='function')throw TypeError('makeSession and wait are required');
 if(!Number.isInteger(maxParallel)||maxParallel<1||maxParallel>4)throw RangeError('maxParallel must be 1..4');
 if(!Number.isInteger(maxSessions)||maxSessions<1)throw RangeError('maxSessions must be positive');
 const nodes=new Map(),events=[],errors=[],queue=[],visitedTasks=new Set();
 const live=new Map();
 let started=false,closed=false,running=false,sessions=0,peak=0,active=0,executed=0;
 const exposeNode=node=>({id:node.id,depth:node.route.length,state:node.state,route:node.route,
  status:node.status,evidence:node.evidence,
  controls:node.controls.map(x=>({...x}))});
 const result=()=>({schema:'fuzzer/forked-decision-tree/v1',
  status:closed?'CLOSED':running?'RUNNING':queue.length?'APPROVED_PENDING':'AWAITING_APPROVAL',
  complete:false,sessionsUsed:sessions,maxSessions,parallelLimit:maxParallel,peakParallel:peak,
  executed,queued:queue.length,liveBranches:[...live.entries()].map(([branchId,entry])=>({
    branchId,tab_id:entry.bonus.peek().view?.tab_id||entry.initial.evidence?.tab_id||null,
    state:entry.bonus.peek().status,verified:entry.bonus.peek().verified,
    purchaseAcknowledged:entry.bonus.peek().purchaseAcknowledged,
    actionsExecuted:entry.bonus.peek().actionsExecuted
  })),nodes:[...nodes.values()].map(exposeNode),
  events:[...events],errors:[...errors]});
 const report=async()=>onProgress(result());
 function discover(snapshot,route,ancestorStates=[]){
  const node={id:id(route),route,state:snapshot.key,status:'AWAITING_APPROVAL',
   evidence:snapshot.evidence||null,controls:summarizeControls(snapshot)};
  if(ancestorStates.includes(snapshot.key)){
   node.status='CYCLE';
   node.controls=[]; // Avoid revisiting a menu indefinitely.
  }else if(route.length>=maxDepth){
   node.status='DEPTH_LIMIT';
   node.controls.forEach(c=>c.status='DEPTH_LIMIT');
  }
  const existing=nodes.get(node.id);
  if(!existing){nodes.set(node.id,node);return node;}
  return existing;
 }
 async function make(){
  if(sessions>=maxSessions)throw Error('SESSION_BUDGET_EXHAUSTED');
  sessions++;active++;peak=Math.max(peak,active);
  let sess;
  try{
   sess=await makeSession(sessions);
   if(!sess?.reset||!sess.snapshot||!sess.click||!sess.close)throw Error('INVALID_SESSION_ADAPTER');
   await sess.reset();
   return sess;
  }catch(e){
   active--;
   try{await sess?.close?.();}catch{}
   throw e;
  }
 }
 async function release(sess){
  try{await sess.close();}finally{active--;}
 }
 async function initialize(){
  if(started||closed)throw Error('TREE_ALREADY_STARTED');
  started=true;
  const sess=await make();
  try{
   const snapshot=await sess.snapshot();
   if(!snapshot?.key)throw Error('MISSING_ROOT_STATE');
   discover(snapshot,[]);
  }finally{await release(sess);}
  await report();
  return result();
 }
 function approve(nodeId,keys){
  if(!started||closed||running)throw Error('TREE_NOT_AVAILABLE');
  const node=nodes.get(nodeId);
  if(!node||node.status!=='AWAITING_APPROVAL')throw Error('NODE_NOT_AVAILABLE');
  if(!Array.isArray(keys)||!keys.length)throw Error('Select at least one control');
  const unique=new Set(keys);
  if(unique.size!==keys.length)throw Error('DUPLICATE_APPROVAL');
  for(const key of unique){
   const c=node.controls.find(x=>x.key===key);
   if(!c||c.ambiguous||c.status!=='UNTESTED')throw Error('UNKNOWN_OR_AMBIGUOUS_CONTROL:'+key);
  }
  for(const key of unique){
   const c=node.controls.find(x=>x.key===key);
   c.status='QUEUED';
   const token=JSON.stringify([node.id,key,c.fingerprint]);
   if(!visitedTasks.has(token)){
    visitedTasks.add(token);
    queue.push({nodeId:node.id,key,fingerprint:c.fingerprint});
   }
  }
  return result();
 }
 function decline(nodeId,keys){
  if(!started||closed||running)throw Error('TREE_NOT_AVAILABLE');
  const node=nodes.get(nodeId);
  if(!node||node.status!=='AWAITING_APPROVAL')throw Error('NODE_NOT_AVAILABLE');
  for(const key of keys){
   const c=node.controls.find(x=>x.key===key);
   if(c?.status==='UNTESTED')c.status='SKIPPED';
  }
  return result();
 }
 const settle=async(session,before)=>{
  // IMPORTANT: suppress implicit center clicks and bonus choices.
  return wait({...session,clickCenter:undefined},before);
 };
 async function task(task){
  const parent=nodes.get(task.nodeId),entry=parent?.controls.find(x=>x.key===task.key);
  if(!parent||!entry)return;
  let sess=null,held=false;
  const trace=[];
  try{
   sess=await make();
   let current=await sess.snapshot();
   for(const step of parent.route){
    if(current.key!==step.from)throw Error('REPLAY_STATE_MISMATCH');
    const control=(current.controls||[]).filter(c=>c.key===step.key&&
      (!step.fingerprint||c.fingerprint===step.fingerprint));
    if(control.length!==1)throw Error('REPLAY_CONTROL_MISSING_OR_CHANGED');
    const previous=current;
    await sess.click(control[0]);
    const settled=await settle(sess,previous);
    current=settled.snapshot;
    trace.push({from:step.from,action:step.key,to:current.key});
    if(current.key!==step.to)throw Error('REPLAY_ROUTE_DIVERGED');
    if(sess.operationStarted?.(previous,current)){
     // Replay paths must be menu-only; never replay a purchased RNG.
     throw Error('REPLAY_OPERATION_NOT_DETERMINISTIC');
    }
   }
   if(current.key!==parent.state)throw Error('TARGET_STATE_CHANGED');
   const controls=(current.controls||[]).filter(c=>c.key===task.key&&
     (!task.fingerprint||c.fingerprint===task.fingerprint));
   if(controls.length!==1)throw Error('STALE_TARGET_CONTROL');
   const before=current;await sess.click(controls[0]);executed++;
   const outcome=await settle(sess,before);
   current=outcome.snapshot||await sess.snapshot();
   const startedOperation=Boolean(sess.operationStarted?.(before,current));
   const edge={from:parent.id,action:task.key,reason:outcome.reason,
    operationStarted:startedOperation,to:null,trace,
    evidence:current.evidence||null};
   if(startedOperation){
    // Pin the SAME session through the entire feature. Never recreate an RNG
    // state, and do not release its tab until the agent resolves/closes it.
    const bonus=createLiveBonusBranch(sess,{before,initial:current,
     onRecord:async()=>report()});
    const branchId=id([...parent.route,{from:before.key,key:task.key,
      fingerprint:task.fingerprint,to:'LIVE_OPERATION'}]);
    edge.status='OPERATION_PAUSED_LIVE';edge.liveBranchId=branchId;
    entry.status='OPERATION_PENDING';
    live.set(branchId,{session:sess,bonus,parentId:parent.id,controlKey:task.key,
     edge,initial:current});
    held=true;
   }else if(current.key===before.key){
    edge.status='NO_CHANGE';entry.status='PENDING';
   }else if(parent.route.some(step=>step.from===current.key)||current.key===parent.route[0]?.from){
    edge.status='CYCLE';entry.status='CYCLE';
   }else{
    const route=[...parent.route,{from:before.key,key:task.key,
      fingerprint:task.fingerprint,to:current.key}];
    const next=discover(current,route,[...parent.route.map(r=>r.from),parent.state]);
    edge.to=next.id;edge.status='DISCOVERED';entry.status='EXPANDED';
   }
   events.push(edge);
  }catch(e){
   const reason=clean(e.message||e);
   entry.status='PENDING';
   errors.push({nodeId:task.nodeId,key:task.key,reason,trace});
  }finally{
   if(sess&&!held)try{await release(sess);}catch(e){errors.push({nodeId:task.nodeId,key:task.key,reason:'CLOSE:'+clean(e.message)});}
   await report();
  }
 }
 async function run(){
  if(!started||closed||running)throw Error('TREE_NOT_AVAILABLE');
  running=true;
  try{
   const items=queue.splice(0);
   let cursor=0;
   async function worker(){
    for(;;){
     const i=cursor++;
     if(i>=items.length)return;
     if(Date.now()>=deadline||sessions>=maxSessions){
      const t=items[i],parent=nodes.get(t.nodeId),c=parent?.controls.find(x=>x.key===t.key);
      if(c)c.status='PENDING';
      errors.push({nodeId:t.nodeId,key:t.key,reason:Date.now()>=deadline?'DEADLINE':'SESSION_BUDGET_EXHAUSTED'});
      continue;
     }
     await task(items[i]);
    }
   }
   // Live bonuses hold a tab until guided completion. Never start another
   // session when the four-tab budget is already held.
   const freeSlots=Math.max(0,maxParallel-active);
   if(!freeSlots){
    queue.unshift(...items);
   }else if(freeSlots<maxParallel){
    // Each worker may finish with a pinned bonus. Remaining queued tasks stay
    // pending for the next invocation, after a live slot has been released.
    const work=items.slice(0,freeSlots);
    queue.unshift(...items.slice(freeSlots));
    let cursor=0;
    await Promise.all(work.map(async t=>{if(sessions>=maxSessions){queue.push(t);return;}await task(t);}));
   }else{
    // Respect slots as they become pinned; do not refill a worker slot that
    // is now held by an active bonus.
    let cursor=0;
    const workerSafe=async()=>{
     while(cursor<items.length){
      if(active>=maxParallel){queue.push(...items.slice(cursor));cursor=items.length;return;}
      const i=cursor++;await task(items[i]);
     }
    };
    await Promise.all(Array.from({length:Math.min(maxParallel,items.length)},workerSafe));
   }
  }finally{running=false;await report();}
  return result();
 }
 async function observeLive(branchId){
  if(running||closed)throw Error('TREE_NOT_AVAILABLE');
  const entry=live.get(branchId);if(!entry)throw Error('UNKNOWN_LIVE_BRANCH');
  const view=await entry.bonus.observe();await report();return {branchId,view};
 }
 async function actLive(branchId,decision){
  if(running||closed)throw Error('TREE_NOT_AVAILABLE');
  const entry=live.get(branchId);if(!entry)throw Error('UNKNOWN_LIVE_BRANCH');
  const action=await entry.bonus.act(decision);
  if(action.view?.status==='COMPLETE'){
   entry.edge.status='OPERATION_COMPLETE_VERIFIED';
   const parent=nodes.get(entry.parentId);
   const control=parent?.controls.find(c=>c.key===entry.controlKey);
   if(control)control.status='COMPLETE';
  }
  await report();
  return {branchId,...action};
 }
 async function closeLive(branchId,{reason='EXPLICIT_CLOSE'}={}){
  if(running||closed)throw Error('TREE_NOT_AVAILABLE');
  const entry=live.get(branchId);if(!entry)throw Error('UNKNOWN_LIVE_BRANCH');
  const verified=entry.bonus.peek().verified;
  // Persist full decision trace/evidence BEFORE releasing the only live
  // browser that can prove what happened inside this particular bonus.
  const audit=entry.bonus.peek();
  entry.edge.bonusAudit={verified:audit.verified,
   purchaseAcknowledged:audit.purchaseAcknowledged,
   actionsExecuted:audit.actionsExecuted,verificationSequence:audit.verificationSequence,
   history:audit.history.map(step=>({...step}))};
  entry.bonus.close();
  entry.edge.status=verified?'OPERATION_COMPLETE_VERIFIED':'OPERATION_PENDING_CLOSED';
  if(!verified)errors.push({nodeId:entry.parentId,key:entry.controlKey,
   reason:'BONUS_NOT_VERIFIED:'+clean(reason)});
  try{await release(entry.session);}finally{live.delete(branchId);await report();}
  return result();
 }
 async function shutdown(){
  if(running)throw Error('TREE_RUNNING');
  // Release pinned tabs even if a bonus is incomplete; preserve its status.
  for(const [branchId] of [...live.entries()])
   await closeLive(branchId,{reason:'TREE_SHUTDOWN'});
  closed=true;
  await report();
  return result();
 }
 return {initialize,approve,decline,run,shutdown,summary:result,observeLive,actLive,closeLive};
}
