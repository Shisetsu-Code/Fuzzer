/**
 * Bounded, purchase-first exploration. Reuses a live DEMO session for sibling
 * purchases, instead of resetting the browser for every observed button.
 * Random outcomes are never used as replay paths or completion evidence.
 */
export function controlPriority(control) {
 const text=[control.name,control.path,...(control.labels||[]),...(control.sprite_names||[]),
  ...(control.handlers||[]).flatMap(h=>[h.event,h.catEventPress,h.catEventClick])]
  .filter(Boolean).join(' ').toLowerCase();
 if (/cancel|close|back|exit|dismiss|decline|reject/.test(text)) return -1;
 if (/buy|purchase|compr|feature.?buy|bonus.?buy/.test(text)) return 100;
 if (/ante|super.?spin|feature|free.?spin|bonus|respin|booster/.test(text)) return 75;
 if (/confirm|accept|select|choice|pick|collect|continue|yes/.test(text)) return 55;
 if (/open|options?|menu|more/.test(text)) return 30;
 return 0;
}

export async function explorePurchaseBatch(a,{
 maxSessions=4,maxActions=30,maxDepth=6,deadline=Infinity,
 wait,onProgress=async()=>{}
}={}) {
 if(typeof wait!=='function')throw new TypeError('A transition observer is required');
 if(!Number.isInteger(maxSessions)||maxSessions<1||maxSessions>4)throw new RangeError('maxSessions: 1..4');
 const nodes=new Map(),edges=[],pending=[],ignored=[],queue=[],enqueued=new Set(),choicePlans=new Set();
 let actions=0,sessions=0,current=null,root=null,dirty=false,verifiedPurchases=0;
 const sig=t=>JSON.stringify([t.state,t.route.map(s=>s.action),t.action,t.choicePlan||[]]);
 const push=t=>{const k=sig(t);if(!enqueued.has(k)){enqueued.add(k);queue.push(t);}};
 const observe=(s,route)=>{
  if(nodes.has(s.key))return;
  nodes.set(s.key,{key:s.key,route,controls:s.controls,evidence:s.evidence});
  for(const control of s.unresolved||[])pending.push({state:s.key,action:control.path,reason:'UNRESOLVED_DRAWING',evidence:s.evidence});
  for(const control of s.controls||[]){
   const priority=controlPriority(control);
   if(priority<=0){ignored.push({state:s.key,action:control.key,reason:'NOT_A_PURCHASE_TARGET'});continue;}
   if(route.length>=maxDepth){pending.push({state:s.key,action:control.key,reason:'DEPTH_LIMIT'});continue;}
   push({state:s.key,route,action:control.key,priority});
  }
 };
 const progress=()=>onProgress({actions,sessions,verifiedPurchases,nodes:[...nodes.values()],edges,pending,ignored,remaining:queue.length});
 const reset=async()=>{
  if(sessions>=maxSessions)return false;
  await a.reset();sessions++;current=await a.snapshot();
  if(root===null)root=current.key;
  dirty=false;
  return true;
 };
 const settle=async(before,choicePlan=[])=>{
  let result=await wait(a,before);
  const finish=async result=>{
   const op=await a.finishOperation(before,result.snapshot,{choicePlan,deadline});
   const {snapshot,...operation}=op;
   return {...result,snapshot:snapshot||result.snapshot,operation,reason:operation.ok?'OPERATION_COMPLETE':operation.reason||'OPERATION_INCOMPLETE'};
  };
  if(a.finishOperation&&a.operationStarted?.(before,result.snapshot))return finish(result);
  const followup=await a.afterAction?.(before,result.snapshot);
  if(followup?.performed){
   const again=await wait(a,result.snapshot);
   const {observedSnapshot,...evidence}=followup;
   result={...again,followup:{...evidence,result:await a.probeResult?.(followup,again.snapshot)}};
  }else if(followup){
   const {observedSnapshot,...evidence}=followup;
   result.followup=evidence;
   if(observedSnapshot)result.snapshot=observedSnapshot;
  }
  if(a.finishOperation&&a.operationStarted?.(before,result.snapshot))return finish(result);
  return result;
 };
 const backControl=s=>(s.controls||[]).find(c=>controlPriority(c)<0);
 const navigate=async task=>{
  if(dirty){if(!await reset())return {error:'SESSION_LIMIT'};}
  let s=current||await a.snapshot();
  if(s.key!==task.state&&s.key!==root){
   // Use a newly observed close/back collider, never a stored coordinate.
   for(let i=0;i<3&&s.key!==root;i++){
    const b=backControl(s);
    if(!b)break;
    await a.click(b);
    const outcome=await settle(s);s=outcome.snapshot;
    if(outcome.operation)break;
   }
  }
  if(s.key!==task.state&&s.key!==root){
   if(!await reset())return {error:'SESSION_LIMIT'};
   s=current;
  }
  if(s.key!==task.state){
   for(const step of task.route){
    if(s.key!==step.from)return {error:'REPLAY_MISMATCH',observed:s.key,expected:step.from};
    const button=(s.controls||[]).find(c=>c.key===step.action);
    if(!button)return {error:'REPLAY_CONTROL_UNAVAILABLE',action:step.action};
    await a.click(button);
    const outcome=await settle(s);s=outcome.snapshot;
    if(outcome.operation||s.key!==step.to)return {error:'REPLAY_MISMATCH',observed:s.key,expected:step.to};
   }
  }
  if(s.key!==task.state)return {error:'REPLAY_MISMATCH',observed:s.key,expected:task.state};
  current=s;return {snapshot:s};
 };
 const queueChoices=(task,operation)=>{
  if(operation.kind==='spin')return;
  const selected=[];
  for(const decision of operation.decisions||[]){
   for(const choice of decision.options||[]){
    const plan=[...selected,choice.key],k=JSON.stringify([task.state,task.action,plan]);
    if(choice.key!==decision.selected&&!choicePlans.has(k)){
     choicePlans.add(k);push({...task,choicePlan:plan});
    }
   }
   selected.push(decision.selected);
   choicePlans.add(JSON.stringify([task.state,task.action,selected]));
  }
 };
 if(!await reset())throw new Error('Cannot start a DEMO session');
 observe(current,[]);
 await progress();
 while(queue.length&&actions<maxActions&&Date.now()<deadline){
  queue.sort((x,y)=>(Number(y.state===current?.key)-Number(x.state===current?.key))*1000+
   y.priority-x.priority||x.route.length-y.route.length);
  const task=queue.shift();
  try{
   const nav=await navigate(task);
   if(nav.error){
    pending.push({...task,reason:nav.error,expected:nav.expected,observed:nav.observed});
    if(nav.error==='SESSION_LIMIT')break;
    dirty=true;continue;
   }
   const before=nav.snapshot,button=(before.controls||[]).find(c=>c.key===task.action);
   if(!button){pending.push({...task,reason:'CONTROL_UNAVAILABLE'});continue;}
   await a.click(button);actions++;
   const outcome=await settle(before,task.choicePlan||[]);
   const after=outcome.snapshot;
   const edge={from:before.key,to:outcome.operation?null:after.key,action:task.action,
    route:task.route.map(x=>x.action),choicePlan:task.choicePlan||[],
    reason:outcome.reason,operation:outcome.operation,followup:outcome.followup,
    evidence:after.evidence};
   edges.push(edge);current=after;
   if(outcome.operation){
    queueChoices(task,outcome.operation);
    if(outcome.operation.ok&&outcome.operation.kind==='purchase')verifiedPurchases++;
    if(!outcome.operation.ok){pending.push({...task,reason:outcome.reason,evidence:after.evidence});dirty=true;}
   }else if(after.key===before.key){
    pending.push({...task,reason:outcome.reason||'NO_TRANSITION',evidence:after.evidence});
   }else{
    observe(after,[...task.route,{from:before.key,to:after.key,action:task.action}]);
   }
  }catch(error){pending.push({...task,reason:'ERROR',error:String(error.message||error).slice(0,300)});dirty=true;}
  finally{await progress();}
 }
 const cause=Date.now()>=deadline?'DEADLINE':actions>=maxActions?'ACTION_LIMIT':'SESSION_LIMIT';
 for(const task of queue)pending.push({...task,reason:cause});
 return {status:pending.length?'PARTIAL':'TARGETS_EXHAUSTED',completeGame:false,
  coverage:{targetsAttempted:actions,verifiedPurchases,sessionsUsed:sessions,
   sessionBudget:maxSessions,targetsRemaining:queue.length,ignoredControls:ignored.length,
   gameComplete:false},actions,sessions,verifiedPurchases,
  nodes:[...nodes.values()],edges,pending,ignored};
}
