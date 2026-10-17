/**
 * Deterministic, capture-driven breadth-first branch planner.
 * The agent approves controls; the scheduler only replays approved UI paths.
 * Each branch owns one isolated DEMO session and HAR. No replay of random RNG.
 */
import {createHash} from 'node:crypto';

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
 let started=false,closed=false,running=false,sessions=0,peak=0,active=0,executed=0;
 const exposeNode=node=>({id:node.id,depth:node.route.length,state:node.state,route:node.route,
  status:node.status,evidence:node.evidence,
  controls:node.controls.map(x=>({...x}))});
 const result=()=>({schema:'fuzzer/forked-decision-tree/v1',
  status:closed?'CLOSED':running?'RUNNING':queue.length?'APPROVED_PENDING':'AWAITING_APPROVAL',
  complete:false,sessionsUsed:sessions,maxSessions,parallelLimit:maxParallel,peakParallel:peak,
  executed,queued:queue.length,nodes:[...nodes.values()].map(exposeNode),
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
  let sess=null;
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
    // Confirmation of an HTTP purchase is not completion of its bonus.
    edge.status='OPERATION_STARTED_NEEDS_GUIDED_COMPLETION';
    entry.status='OPERATION_PENDING';
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
   if(sess)try{await release(sess);}catch(e){errors.push({nodeId:task.nodeId,key:task.key,reason:'CLOSE:'+clean(e.message)});}
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
   await Promise.all(Array.from({length:Math.min(maxParallel,items.length)},worker));
  }finally{running=false;await report();}
  return result();
 }
 async function shutdown(){
  if(running)throw Error('TREE_RUNNING');
  closed=true;
  await report();
  return result();
 }
 return {initialize,approve,decline,run,shutdown,summary:result};
}
