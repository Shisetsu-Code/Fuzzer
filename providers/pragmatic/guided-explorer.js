import {randomUUID} from 'node:crypto';
import {controlPriority} from './batch-explorer.js';

/** One ChatGPT decision per click. No hidden menu traversal, replay, pick or spin. */
export function createGuidedExplorer(adapter,{maxSessions=4,wait,readEvidence=async()=>({}),onRecord=async()=>{}}={}){
 if(!Number.isInteger(maxSessions)||maxSessions<3||maxSessions>4)throw RangeError('maxSessions must be 3 or 4');
 if(typeof wait!=='function')throw TypeError('A bounded transition observer is required');
 let sessions=0,started=false,closed=false,busy=false,current=null,view=null,revision=0;
 const history=[],skipped=new Set();
 const record=async(e)=>{history.push(e);await onRecord({sessions,revision,history});};
 const safe=(s)=>({state_key:s.key,tab_id:s.evidence?.tab_id,screenshot:s.evidence?.full_path,
  capture_id:s.evidence?.capture_id,flags:s.flags||{},wager:{menuOpen:s.wager?.menuOpen??null,betLevelIndex:s.wager?.betLevelIndex??null},
  operation:{sequence:s.operation?.sequence||0,kind:s.operation?.kind??null,submitted:s.operation?.transaction?.complete===true,
   protocolComplete:s.operation?.protocolComplete===true,nextAction:s.operation?.nextAction??null},
  unresolved:(s.unresolved||[]).map(c=>({path:c.path,reason:c.reason}))});
 const snapshotView=async(s)=>{
  const evidence=await readEvidence(s);
  const indexed=new Map((evidence.controls||[]).map(c=>[c.path,c]));
  const actions=[];
  for(const c of s.choices||[]){
   actions.push({action_id:'p'+actions.length,kind:'picker',key:c.key,path:c.path,
    label:c.name||c.labels?.join(' ')||'Feature choice',event:c.event,
    priority:100,requiresDecision:true});
  }
  for(const b of s.controls||[]){
   const id=s.key+'|'+b.key+'|'+(b.fingerprint||'');
   if(skipped.has(id))continue;
   const crop=indexed.get(b.key);
   actions.push({action_id:'b'+actions.length,kind:'button',key:b.key,
    name:b.name,labels:b.labels||[],sprites:b.sprite_names||[],
    fingerprint:b.fingerprint||null,priority:controlPriority(b),crop_path:crop?.crop_path||null,
    clickable:b.clickable,occlusion:b.occlusion||'NOT_VERIFIED',requiresDecision:true});
  }
  // A normal DEMO spin is never submitted without a specific decision.
  const f=s.flags||{};
  if(f.canSpin===true&&!f.logicIsFreeSpin&&!f.respinInProgress&&!f.spinBlockingFeatureIsRunning
      &&!f.stopActive&&!s.wager?.menuOpen&&!(s.choices||[]).length){
   actions.push({action_id:'spin_normal',kind:'spin',label:'One normal DEMO spin',
    priority:10,requiresDecision:true});
  }
  // No automatic center clicks: only the model may request this with visual evidence.
  if(!(s.choices||[]).length){
   actions.push({action_id:'continue_center',kind:'continue',label:'Center of DEMO frame: verify overlay visually first',
    priority:-100,requiresDecision:true,risk:'UNVERIFIED_OVERLAY'});
  }
  actions.sort((a,b)=>b.priority-a.priority);
  const token=randomUUID();revision++;
  current=s;
  view={status:'AWAITING_DECISION',token,revision,sessions_used:sessions,max_sessions:maxSessions,
   ...safe(s),actions,skipped:skipped.size,history_count:history.length,
   warning:'No action will be taken until guided_act(token,action_id) selects a current visible action. Use HardFire screenshot(tab_id) to judge overlays.'};
  return view;
 };
 async function observe(){
  if(!started||closed)throw Error('GUIDED_SESSION_NOT_ACTIVE');
  if(busy)throw Error('GUIDED_SESSION_BUSY');
  busy=true;
  try{return await snapshotView(await adapter.snapshot({forceCapture:true}));}
  finally{busy=false;}
 }
 async function start(){
  if(started||closed)throw Error('GUIDED_ALREADY_STARTED');
  busy=true;
  try{await adapter.reset();sessions++;started=true;return await snapshotView(await adapter.snapshot({forceCapture:true}));}
  finally{busy=false;}
 }
 async function act({token,action_id}){
  if(!started||closed)throw Error('GUIDED_SESSION_NOT_ACTIVE');
  if(busy)throw Error('GUIDED_SESSION_BUSY');
  if(!view||token!==view.token)return {status:'STALE_DECISION',reason:'Token no longer matches the latest observation; nothing clicked'};
  const chosen=view.actions.find(a=>a.action_id===action_id);
  if(!chosen)return {status:'INVALID_DECISION',reason:'Action not present in this observation; nothing clicked'};
  busy=true;
  try{
   const before=await adapter.snapshot({forceCapture:true});
   if(before.key!==current.key||(before.operation?.sequence||0)!==(current.operation?.sequence||0)){
    return {status:'STATE_CHANGED',reason:'State changed since the decision; nothing clicked',view:await snapshotView(before)};
   }
   let result;
   if(chosen.kind==='button'){
    const button=(before.controls||[]).find(b=>b.key===chosen.key&&b.fingerprint===chosen.fingerprint);
    if(!button)return {status:'CONTROL_CHANGED',reason:'Button identity changed; nothing clicked',view:await snapshotView(before)};
    result=await adapter.click(button);
   }else if(chosen.kind==='picker'){
    const picker=(before.choices||[]).find(c=>c.key===chosen.key&&c.event===chosen.event);
    if(!picker)return {status:'CHOICE_CHANGED',reason:'Picker no longer active; nothing clicked',view:await snapshotView(before)};
    result=await adapter.choose(picker);
    if(result?.ok===false)throw Error('PICKER_ACTION_FAILED');
   }else if(chosen.kind==='spin'){
    if(before.flags?.canSpin!==true||before.wager?.menuOpen||before.choices?.length)
      return {status:'SPIN_UNAVAILABLE',reason:'No safe normal DEMO spin; nothing clicked',view:await snapshotView(before)};
    result=await adapter.spinNormal(before);
    if(result?.ok!==true)throw Error('NORMAL_SPIN_UNAVAILABLE');
   }else if(chosen.kind==='continue'){
    if(before.choices?.length)
     return {status:'CONTINUE_UNAVAILABLE',reason:'A feature picker is available; nothing clicked',view:await snapshotView(before)};
    result=await adapter.clickCenter(before);
    if(result?.ok!==true)throw Error('CONTINUE_FAILED');
   }else throw Error('UNSUPPORTED_ACTION');
   // IMPORTANT: disallow waitTransition's implicit center click and disallow
   // finishOperation's unapproved choice selection/normal spins.
   const outcome=await wait({...adapter,clickCenter:undefined},before);
   const next=outcome.snapshot||await adapter.snapshot({forceCapture:true});
   await record({action:chosen.kind,action_id:chosen.action_id,path:chosen.key||null,
    from:before.key,to:next.key,reason:outcome.reason,
    operationStart:(next.operation?.sequence||0)>(before.operation?.sequence||0),
    at:new Date().toISOString()});
   const nextView=await snapshotView(next);
   return {status:'DECISION_EXECUTED',outcome:{reason:outcome.reason,
    operationStarted:(next.operation?.sequence||0)>(before.operation?.sequence||0)},
    view:nextView};
  }finally{busy=false;}
 }
 async function skip({token,action_id}){
  if(!started||closed||busy)throw Error('GUIDED_SESSION_NOT_AVAILABLE');
  if(token!==view?.token)return {status:'STALE_DECISION',reason:'Nothing skipped'};
  const c=view.actions.find(a=>a.action_id===action_id&&a.kind==='button');
  if(!c)return {status:'INVALID_DECISION'};
  busy=true;
  try{
   skipped.add(current.key+'|'+c.key+'|'+c.fingerprint);
   await record({action:'skip',path:c.key,at:new Date().toISOString()});
   return {status:'SKIPPED_WITHOUT_CLICK',view:await snapshotView(await adapter.snapshot({forceCapture:true}))};
  }finally{busy=false;}
 }
 async function reset(){
  if(!started||closed||busy)throw Error('GUIDED_SESSION_NOT_AVAILABLE');
  if(sessions>=maxSessions)return {status:'SESSION_LIMIT',sessions_used:sessions};
  busy=true;
  try{await adapter.reset();sessions++;skipped.clear();await record({action:'reset',at:new Date().toISOString()});
   return {status:'RESET',view:await snapshotView(await adapter.snapshot({forceCapture:true}))};
  }finally{busy=false;}
 }
 async function close(){
  if(busy)throw Error('GUIDED_SESSION_BUSY');
  if(closed)return {status:'CLOSED',sessions_used:sessions,history};
  busy=true;
  try{closed=true;return {status:'CLOSED',sessions_used:sessions,history};}
  finally{busy=false;}
 }
 return {start,observe,act,skip,reset,close,getView:()=>view,getHistory:()=>history,sessionCount:()=>sessions};
}
