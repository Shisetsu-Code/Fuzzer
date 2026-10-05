/** Breadth-first replay exploration. Actions are selected only from observed controls. */
export async function waitTransition(a,before,{quietMs=10000,activeMs=60000,pollMs=500}={}){
 const start=a.now();let lastTraffic=start,lastContinuation=start,traffic=before.traffic,current=before,changed=null,hadTraffic=false,continuationClicks=0;
 while(a.now()-start<activeMs){await a.sleep(pollMs);current=await a.snapshot();const now=a.now();
 if(current.traffic!==traffic){traffic=current.traffic;lastTraffic=now;hadTraffic=true;}
 if(a.operationStarted?.(before,current))return {snapshot:current,reason:'OPERATION_STARTED',continuationClicks,elapsedMs:now-start};
 if(current.key!==before.key){if(changed===current.key&&(!hadTraffic||now-lastTraffic>=quietMs)&&current.controls.length)return {snapshot:current,reason:'STATE_CHANGED',continuationClicks,elapsedMs:now-start};changed=current.key;}else changed=null;
 if(!current.controls.length&&now-lastContinuation>=5000){await a.clickCenter?.();continuationClicks++;lastContinuation=now;}
 if(now-start>=quietMs&&now-lastTraffic>=quietMs)return {snapshot:current,reason:current.key!==before.key?'STATE_CHANGED':'QUIET_TIMEOUT',continuationClicks,elapsedMs:now-start};
 }
 return {snapshot:current,reason:'ACTIVE_TIMEOUT',continuationClicks,elapsedMs:a.now()-start};
}
export async function exploreStates(a,{maxActions=20,maxDepth=4,wait=waitTransition,onProgress=async()=>{},deadline=Infinity}={}){
 const nodes=new Map(),edges=[],pending=[],queue=[],operationPlans=new Set();let actions=0;
 const finish=async(before,outcome,choicePlan)=>{
   const result=await a.finishOperation(before,outcome.snapshot,{choicePlan,deadline});
   const {snapshot,...operation}=result;
   return {...outcome,snapshot:snapshot||outcome.snapshot,operation,reason:operation.ok?'OPERATION_COMPLETE':operation.reason||'OPERATION_INCOMPLETE'};
 };
 const settle=async(before,choicePlan=[])=>{
   let outcome=await wait(a,before);
   if(a.finishOperation&&a.operationStarted?.(before,outcome.snapshot))return finish(before,outcome,choicePlan);
   const followup=await a.afterAction?.(before,outcome.snapshot);
   if(followup?.performed){
     const second=await wait(a,outcome.snapshot);
     outcome={...second,followup:{...followup,result:await a.probeResult?.(followup,second.snapshot)},continuationClicks:(outcome.continuationClicks||0)+(second.continuationClicks||0)};
   }else if(followup){const {observedSnapshot,...evidence}=followup;outcome.followup=evidence;if(observedSnapshot)outcome.snapshot=observedSnapshot;}
   if(a.finishOperation&&a.operationStarted?.(before,outcome.snapshot))outcome=await finish(before,outcome,choicePlan);
   return outcome;
 };
 const queueChoices=(task,operation)=>{
   // A random feature on an ordinary/antebet spin is resolved, never replayed.
   if(operation.kind==='spin')return;
   const selected=[];
   for(const decision of operation.decisions||[]){
     for(const option of decision.options||[]){
       const plan=[...selected,option.key],key=JSON.stringify([task.state,task.action,task.route,plan]);
       if(option.key!==decision.selected&&!operationPlans.has(key)){operationPlans.add(key);queue.push({...task,choicePlan:plan});}
     }
     selected.push(decision.selected);
     operationPlans.add(JSON.stringify([task.state,task.action,task.route,selected]));
   }
   operationPlans.add(JSON.stringify([task.state,task.action,task.route,selected]));
 };
 const observe=(s,route)=>{if(nodes.has(s.key))return;nodes.set(s.key,{key:s.key,controls:s.controls,unresolved:s.unresolved||[],evidence:s.evidence,route});for(const c of s.unresolved||[])pending.push({state:s.key,route,action:c.path,reason:"UNRESOLVED_DRAWING",detail:c.reason,evidence:s.evidence});for(const b of s.controls){if(route.length>=maxDepth){pending.push({state:s.key,action:b.key,reason:'DEPTH_LIMIT'});continue;}queue.push({state:s.key,route,action:b.key});}};
 await a.reset();observe(await a.snapshot(),[]);
 while(queue.length&&actions<maxActions&&Date.now()<deadline){const task=queue.shift();try{
 if(actions)await a.reset();let s=await a.snapshot();let failed=false;const replayTrace=[];
 for(const step of task.route){if(s.key!==step.from){failed=true;break;}const b=s.controls.find(b=>b.key===step.action);if(!b){failed=true;break;}await a.click(b);s=(await settle(s)).snapshot;replayTrace.push({action:step.action,expected:step.to,observed:s.key,evidence:s.evidence});if(s.key!==step.to){failed=true;break;}}
 if(failed||s.key!==task.state){pending.push({...task,reason:'REPLAY_MISMATCH',expected:task.state,observed:s.key,replayTrace,evidence:s.evidence});continue;}
 const b=s.controls.find(b=>b.key===task.action);if(!b){pending.push({...task,reason:'CONTROL_UNAVAILABLE'});continue;}
 await a.click(b);actions++;const outcome=await settle(s,task.choicePlan);const next=outcome.snapshot;const edge={from:s.key,to:outcome.operation?null:next.key,action:b.key,reason:outcome.reason,followup:outcome.followup,operation:outcome.operation,choicePlan:task.choicePlan||[],continuationClicks:outcome.continuationClicks||0,elapsedMs:outcome.elapsedMs,evidence:next.evidence};edges.push(edge);
 if(outcome.operation){queueChoices(task,outcome.operation);if(!outcome.operation.ok)pending.push({...task,reason:outcome.reason,evidence:next.evidence});}
 else if(next.key===s.key)pending.push({...task,reason:outcome.reason||'NO_TRANSITION',evidence:next.evidence});else observe(next,[...task.route,{from:s.key,to:next.key,action:b.key}]);
 }catch(e){pending.push({...task,reason:'ERROR',error:String(e.message)});}finally{await onProgress({nodes:[...nodes.values()],edges,pending,actions});}}
 pending.push(...queue.map(t=>({...t,reason:Date.now()>=deadline?'DEADLINE':'ACTION_LIMIT'})));
 return {status:pending.length?'PARTIAL':'EXHAUSTED_OBSERVED_CONTROLS',nodes:[...nodes.values()],edges,pending,actions,completeGame:false};
}
