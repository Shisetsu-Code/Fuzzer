import {createHash} from 'node:crypto';
import {measure} from '../../lib/performance.js';
/** Bounded traversal of observed controls; action mode follows children inline. */
export async function waitTransition(a,before,{quietMs=10000,activeMs=60000,pollMs=500,mode='strict',deadline=Infinity}={}){
 const start=a.now();let lastTraffic=start,lastContinuation=start,traffic=before.traffic,current=before,changed=null,hadTraffic=false,continuationClicks=0;
 while(a.now()-start<activeMs&&a.now()<deadline){await a.sleep(pollMs);current=await a.snapshot();const now=a.now();
 if(now>=deadline)return {snapshot:current,reason:'DEADLINE',continuationClicks,elapsedMs:now-start};
 const observedTraffic=mode==='actions'?current.capture?.marker:current.traffic;
 if(observedTraffic!==traffic){traffic=observedTraffic;lastTraffic=now;hadTraffic=true;}
 const inputReady=mode!=='actions'||current.inputReady===true&&current.capture?.pending===false&&current.capture?.uncertain!==true;
 if(a.operationStarted?.(before,current))return {snapshot:current,reason:'OPERATION_STARTED',continuationClicks,elapsedMs:now-start};
 if(current.key!==before.key){if(changed===current.key&&inputReady&&(mode==='actions'||!hadTraffic||now-lastTraffic>=quietMs)&&current.controls.length)return {snapshot:current,reason:'STATE_CHANGED',continuationClicks,elapsedMs:now-start};changed=current.key;}else changed=null;
 if(mode!=='actions'&&!current.controls.length&&now-lastContinuation>=5000){await a.clickCenter?.();continuationClicks++;lastContinuation=now;}
 if(inputReady&&now-start>=quietMs&&(mode==='actions'||now-lastTraffic>=quietMs))return {snapshot:current,reason:current.key!==before.key?'STATE_CHANGED':'QUIET_TIMEOUT',continuationClicks,elapsedMs:now-start};
 }
 return {snapshot:current,reason:'ACTIVE_TIMEOUT',continuationClicks,elapsedMs:a.now()-start};
}
/** Menu identity excludes transient operation flags and random balance/results.
 * Readiness and the request boundary are checked independently before input.
 */
export function createNavigationKey({controls=[],unresolved=[],wager={}}={}){
 const buttons=controls.map(b=>({path:b.key??b.path,labels:b.labels||[],sprites:b.sprite_names||[],enabled:b.enabled!==false})).sort((a,b)=>String(a.path).localeCompare(String(b.path)));
 const missing=unresolved.map(c=>({path:c.path,reason:c.reason})).sort((a,b)=>String(a.path).localeCompare(String(b.path)));
 return createHash('sha256').update(JSON.stringify({buttons,missing,betLevelIndex:wager.betLevelIndex??null,menuOpen:wager.menuOpen===true})).digest('hex').slice(0,20);
}

const recoverableReasons=new Set([
 'ACTIVE_TIMEOUT','QUIET_TIMEOUT','NO_TRANSITION','REPLAY_MISMATCH','CONTROL_UNAVAILABLE',
 'OPERATION_TIMEOUT','OPERATION_STALLED','OPERATION_SUBMISSION_UNAVAILABLE',
 'CHOICE_NOT_OBSERVED','CHOICE_NOT_AVAILABLE','CHOICE_ACTION_FAILED',
 'ACTION_PROTOCOL_CHANGED','ACTION_CLICK_UNCONFIRMED','CONTINUATION_ACTION_UNCONFIRMED'
]);
const taskId=task=>createHash('sha256').update(JSON.stringify([task.state,task.route,task.action,task.choicePlan||[]])).digest('hex').slice(0,24);

export async function exploreStates(a,{maxActions=20,maxDepth=4,wait=waitTransition,onProgress=async()=>{},deadline=Infinity,mode='strict',maxRetries=mode==='actions'?2:0,maxRouteAttempts=maxActions*(maxRetries+1)}={}){
 if(!Number.isInteger(maxRetries)||maxRetries<0||maxRetries>5)throw Error('INVALID_RETRY_LIMIT');
 if(!Number.isInteger(maxRouteAttempts)||maxRouteAttempts<1||maxRouteAttempts>10000)throw Error('INVALID_ROUTE_ATTEMPT_LIMIT');
 const now=()=>a.now?.()??Date.now();
 const nodes=new Map(),routes=new Map(),edges=[],pending=[],queue=[],retryQueue=[],attemptHistory=[],operationPlans=new Set();
 let actions=0,attemptedActions=0,routeAttempts=0,cleanupFailure=null,inFlight=null,reuseTask=null;
 const recovery=()=>({maxRetries,routeAttempts,retries:[...routes.values()].reduce((sum,r)=>sum+Math.max(0,r.attempts-1),0),
  discoveredRoutes:routes.size,validRoutes:[...routes.values()].filter(r=>r.valid).length,
  resolvedRoutes:[...routes.values()].filter(r=>r.resolved).length,recoveredRoutes:[...routes.values()].filter(r=>r.resolved&&r.attempts>1).length,
  blockedRoutes:pending.filter(p=>p.disposition==='blocked').length,deferredRoutes:pending.filter(p=>p.disposition==='deferred').length});
 const progress=()=>onProgress({nodes:[...nodes.values()],edges,pending,queued:[...queue,...retryQueue],inFlight,actions,attemptedActions,recovery:recovery(),attemptHistory,...cleanupFailure});
 const budget=()=>{if(now()>=deadline)throw Object.assign(Error('DEADLINE'),{code:'DEADLINE'});};
 const register=task=>{
  const fresh={state:task.state,route:task.route,action:task.action,...(task.choicePlan?.length?{choicePlan:task.choicePlan}:{})};
  fresh.routeId=taskId(fresh);if(routes.has(fresh.routeId))return null;
  routes.set(fresh.routeId,{attempts:0,valid:false,resolved:false,lastFailure:null});return fresh;
 };
 const failure=(task,reason,detail={})=>{
  const meta=routes.get(task.routeId);meta.lastFailure=reason;
  attemptHistory.push({routeId:task.routeId,attempt:meta.attempts,reason,...detail});
  if(recoverableReasons.has(reason)&&meta.attempts<=maxRetries&&!cleanupFailure){retryQueue.push(task);return;}
  pending.push({...task,reason,...detail,attempts:meta.attempts,disposition:reason==='DEADLINE'?'deferred':'blocked'});
 };
 const dispatch=async(task,control,phase)=>{
  budget();inFlight={phase,action:control.key,route:task.route,routeId:task.routeId,attempt:routes.get(task.routeId).attempts,choicePlan:task.choicePlan||[]};
  await progress();budget();return measure(phase==='replay'?'dispatch.replay':'dispatch.action',()=>a.click(control));
 };
 const finish=async(before,outcome,choicePlan)=>{
  budget();const result=await a.finishOperation(before,outcome.snapshot,{choicePlan,deadline});
  const {snapshot,...operation}=result;
  return {...outcome,snapshot:snapshot||outcome.snapshot,operation,reason:operation.ok?'OPERATION_COMPLETE':operation.reason||'OPERATION_INCOMPLETE'};
 };
 const settle=async(before,choicePlan=[])=>{
  let outcome=await wait(a,before);budget();
  if(a.finishOperation&&a.operationStarted?.(before,outcome.snapshot))return finish(before,outcome,choicePlan);
  if(outcome.reason==='ACTIVE_TIMEOUT'||outcome.reason==='DEADLINE')return outcome;
  // A newly opened ready menu is the next graph node, not a reason to wait
  // five seconds and try a spin. Record its alternatives while they are here.
  if(mode==='actions'&&outcome.reason==='STATE_CHANGED'&&outcome.snapshot.inputReady===true&&outcome.snapshot.capture?.pending===false&&outcome.snapshot.capture?.uncertain!==true&&
     (outcome.snapshot.wager?.menuOpen||(outcome.snapshot.choices||[]).length))return outcome;
  budget();const followup=await a.afterAction?.(before,outcome.snapshot);
  if(followup?.performed){
   const second=await wait(a,outcome.snapshot);
   outcome={...second,followup:{...followup,result:await a.probeResult?.(followup,second.snapshot)},continuationClicks:(outcome.continuationClicks||0)+(second.continuationClicks||0)};
  }else if(followup){const {observedSnapshot,...evidence}=followup;outcome.followup=evidence;if(observedSnapshot)outcome.snapshot=observedSnapshot;}
  if(a.finishOperation&&a.operationStarted?.(before,outcome.snapshot))outcome=await finish(before,outcome,choicePlan);
  return outcome;
 };
 const queueChoices=(task,operation)=>{
  if(mode!=='actions'&&operation.kind==='spin')return;
  const selected=[];
  for(const decision of operation.decisions||[]){
   for(const option of decision.options||[]){
    const plan=[...selected,option.key],key=JSON.stringify([task.state,task.action,task.route,plan]);
    if(option.key!==decision.selected&&!operationPlans.has(key)){
     operationPlans.add(key);const next=register({...task,choicePlan:plan});if(next)queue.push(next);
    }
   }
   // An unsuccessful choice records its options but is not a traversed prefix.
   if(decision.selected===null||decision.selected===undefined)break;
   selected.push(decision.selected);operationPlans.add(JSON.stringify([task.state,task.action,task.route,selected]));
  }
  operationPlans.add(JSON.stringify([task.state,task.action,task.route,selected]));
 };
 const observe=(s,route)=>{
  if(nodes.has(s.key))return null;
  const discovered=[];nodes.set(s.key,{key:s.key,controls:s.controls,unresolved:s.unresolved||[],evidence:s.evidence,route});
  for(const c of s.unresolved||[])pending.push({state:s.key,route,action:c.path,reason:c.reason==='NO_PROJECTED_HIT_RECT'?'UNRESOLVED_HIT_AREA':'UNRESOLVED_DRAWING',detail:c.reason,evidence:s.evidence,disposition:'blocked'});
  for(const b of s.controls){
   if(b.enabled===false)continue;
   if(route.length>=maxDepth){pending.push({state:s.key,route,action:b.key,reason:'DEPTH_LIMIT',disposition:'deferred'});continue;}
   const task=register({state:s.key,route,action:b.key});if(task)discovered.push(task);
  }
  if(mode==='actions')queue.unshift(...discovered);else queue.push(...discovered);
  return discovered[0]||null;
 };
 const learnVariant=(s,route)=>{
  if(mode==='actions'&&s.inputReady===true&&s.capture?.pending===false&&s.capture?.uncertain!==true)observe(s,route);
 };
 budget();await a.reset();observe(await a.snapshot(),[]);
 while((queue.length||retryQueue.length)&&attemptedActions<maxActions&&routeAttempts<maxRouteAttempts&&now()<deadline&&!cleanupFailure){
  // Recovery gets a separate FIFO: newly discovered routes always go first.
  const task=queue.length?queue.shift():retryQueue.shift(),meta=routes.get(task.routeId);
  meta.attempts++;const started=now();
  try{
   const reuse=mode==='actions'&&task===reuseTask&&meta.attempts===1;reuseTask=null;
   if(routeAttempts++&&!reuse)await a.reset();let s=await a.snapshot(),inline=reuse&&s.key===task.state;
   if(reuse&&!inline){await a.reset();s=await a.snapshot();}
   budget();let failed=false,replayFailure=null;const replayTrace=[],actualRoute=[];
   for(const step of inline?[]:task.route){
    if(s.key!==step.from){learnVariant(s,actualRoute);failed=true;break;}
    const b=s.controls.find(b=>b.key===step.action&&b.enabled!==false);if(!b){failed=true;break;}
    const from=s.key;await dispatch(task,b,'replay');const replay=await measure('settle.replay',()=>settle(s));s=replay.snapshot;
    actualRoute.push({from,to:s.key,action:step.action});
    replayTrace.push({action:step.action,expected:step.to,observed:s.key,reason:replay.reason,evidence:s.evidence});
    if(replay.reason==='ACTIVE_TIMEOUT'||replay.operation?.ok===false){replayFailure=replay.reason||'OPERATION_INCOMPLETE';break;}
    if(s.key!==step.to){learnVariant(s,actualRoute);failed=true;break;}
   }
   if(replayFailure){failure(task,replayFailure,{phase:'replay',expected:task.state,observed:s.key,replayTrace,evidence:s.evidence});continue;}
   if(failed||s.key!==task.state){if(!failed)learnVariant(s,actualRoute);failure(task,'REPLAY_MISMATCH',{expected:task.state,observed:s.key,replayTrace,evidence:s.evidence});continue;}
   const b=s.controls.find(b=>b.key===task.action&&b.enabled!==false);
   if(!b){failure(task,'CONTROL_UNAVAILABLE');continue;}
   attemptedActions++;await dispatch(task,b,'action');actions++;
   const outcome=await measure('settle.action',()=>settle(s,task.choicePlan)),next=outcome.snapshot;
   const edge={routeId:task.routeId,attempt:meta.attempts,from:s.key,to:outcome.operation?null:next.key,action:b.key,reason:outcome.reason,followup:outcome.followup,operation:outcome.operation,choicePlan:task.choicePlan||[],continuationClicks:outcome.continuationClicks||0,elapsedMs:outcome.elapsedMs,attemptElapsedMs:now()-started,evidence:next.evidence};
   if(mode==='actions'){
    const accepted=outcome.operation?.submission?.complete===true&&outcome.operation.submission.status===200;
    const changed=outcome.reason==='STATE_CHANGED'&&next.key!==s.key,probed=outcome.followup?.performed===true&&outcome.followup?.result?.status===200;
    edge.validity={valid:accepted||changed||probed,basis:accepted?'ACCEPTED_REQUEST':probed?'PROBE_EXECUTED':changed?'UI_TRANSITION':'UNCONFIRMED',terminal:outcome.operation?.ok===true};
    meta.valid||=edge.validity.valid;
   }
   edges.push(edge);
   if(outcome.operation){queueChoices(task,outcome.operation);if(!outcome.operation.ok)failure(task,outcome.reason,{evidence:next.evidence});else meta.resolved=true;}
   else if(outcome.reason==='ACTIVE_TIMEOUT'||next.key===s.key)failure(task,outcome.reason||'NO_TRANSITION',{evidence:next.evidence});
   else{meta.resolved=true;reuseTask=observe(next,[...task.route,{from:s.key,to:next.key,action:b.key}]);}
  }catch(e){
   const retained=e.retainedTabIds||[];
   if(e.code==='SESSION_CLEANUP_FAILED'||retained.length){
    cleanupFailure={cleanupError:String(e.cleanupError||e.message),retainedTabIds:retained,cleanupPending:true};
    failure(task,'SESSION_CLEANUP_FAILED',{error:String(e.message),...cleanupFailure});
   }else failure(task,e.code==='DEADLINE'||e.message==='DEADLINE'?'DEADLINE':recoverableReasons.has(e.code)?e.code:recoverableReasons.has(e.message)?e.message:'ERROR',{error:String(e.message)});
  }finally{inFlight=null;await progress();}
 }
 const stopReason=cleanupFailure?'CLEANUP_FAILED':now()>=deadline?'DEADLINE':(queue.length||retryQueue.length)&&attemptedActions>=maxActions?'ACTION_LIMIT':(queue.length||retryQueue.length)&&routeAttempts>=maxRouteAttempts?'ROUTE_ATTEMPT_LIMIT':pending.length?'BLOCKED_ROUTES':'EXHAUSTED_OBSERVED_CONTROLS';
 const queued=[...queue,...retryQueue];
 for(const task of queued){const meta=routes.get(task.routeId);pending.push({...task,reason:cleanupFailure?'SESSION_CLEANUP_FAILED':stopReason,attempts:meta.attempts,lastFailure:meta.lastFailure,disposition:'deferred'});}
 return {status:pending.length?'PARTIAL':'EXHAUSTED_OBSERVED_CONTROLS',stopReason,nodes:[...nodes.values()],edges,pending,queued,attemptHistory,recovery:recovery(),actions,attemptedActions,completeGame:false,...cleanupFailure};
}
