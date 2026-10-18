import {randomUUID} from 'node:crypto';
import {normalControlsReady} from './operation-completion.js';

/**
 * A purchased feature belongs to its existing isolated live DEMO session.
 * Every choice or continuation is selected explicitly by the agent; nothing
 * is inferred from reel RNG or resubmitted when an HTTP response is missing.
 */
export function createLiveBonusBranch(session,{
 before,initial,deadline=Infinity,maxActions=150,now=()=>Date.now(),
 onRecord=async()=>{}
}={}){
 if(!before||!initial||typeof session?.snapshot!=='function')
  throw TypeError('A live session and purchase snapshots are required');
 let current=initial,view=null,closed=false,busy=false,actions=0,readyTicks=0;
 let purchased=false,verificationStartedAt=null,verificationSequence=null,verified=false;
 const history=[],stoppedSpins=new Set(),initialSequence=before.operation?.sequence||0;
 const initialPurchase=initial.operation?.transaction?.kind==='purchase';
 const value=()=>({
  status:closed?'CLOSED':view?.status||'WAITING_FOR_PURCHASE_ACK',
  purchaseAcknowledged:purchased,
  purchaseSubmission:initialPurchase?initial.operation?.transaction:null,
  verificationStartedAt,verificationSequence,verified,
  actionsExecuted:actions,stoppedSpinSequences:[...stoppedSpins],history:[...history],view
 });
 const record=async data=>{history.push(data);await onRecord(value());};
 function stateFor(snapshot){
  const op=snapshot.operation||{},tx=op.transaction||{},flags=snapshot.flags||{};
  if(!purchased&&op.sequence>initialSequence&&tx.kind==='purchase'&&tx.complete===true&&tx.status===200)
   purchased=true;
  if(verificationSequence!==null&&op.sequence>verificationSequence&&
    tx.kind==='spin'&&tx.status===200&&tx.complete===true&&
    normalControlsReady(snapshot)){
   readyTicks++;
   if(readyTicks>=2)verified=true;
  }else if(verificationSequence===null&&purchased&&normalControlsReady(snapshot)){
   readyTicks++;
  }else readyTicks=0;
  if(verified)return 'COMPLETE';
  if(!purchased)return 'WAITING_FOR_PURCHASE_ACK';
  if((snapshot.choices||[]).length)return 'CHOICE_REQUIRED';
  if(verificationSequence!==null)return 'VERIFYING_NORMAL_SPIN';
  if(readyTicks>=2)return 'READY_FOR_VERIFICATION';
  if(flags.logicIsFreeSpin||flags.respinInProgress||flags.spinBlockingFeatureIsRunning)
   return 'BONUS_ACTIVE';
  return 'AWAITING_DECISION';
 }
 function choicesFor(snapshot,status){
  const acts=[],seen=new Set();
  const choiceList=snapshot.choices||[];
  for(const choice of choiceList){
   const key=String(choice.key||'');
   if(!key||seen.has('picker:'+key))continue;
   seen.add('picker:'+key);
   acts.push({action_id:'pick:'+key,kind:'picker',key,
    label:String(choice.name||choice.labels?.join(' ')||'Pick').slice(0,120),
    event:choice.event,priority:100});
  }
  if(!choiceList.length&&status==='BONUS_ACTIVE'&&snapshot.flags?.stopActive===true&&purchased){
   // Explicitly approved Stop only once per server spin, never resend doSpin.
   // Prefer the leaf collider over its outer duplicate hit area.
   const stops=(snapshot.controls||[]).filter(c=>c.fingerprint&&
    (c.handlers||[]).some(h=>h.event==='Evt_DataToCode_Pressed_Stop'));
   const specific=stops.filter(c=>/\/StopSpin_Button\/Collider$/.test(c.key||''));
   for(const c of (specific.length?specific:stops)){
    if(stoppedSpins.has(snapshot.operation?.sequence||0))break;
    acts.push({action_id:'stop:'+c.key,kind:'stop',key:c.key,
     fingerprint:c.fingerprint,label:'Stop current observed DEMO animation',
     priority:90});
   }
  }
  if(!choiceList.length&&verificationSequence===null&&purchased){
   for(const c of snapshot.controls||[]){
    const key=String(c.key||'');
    if(!key||!c.fingerprint||seen.has('button:'+key))continue;
    const identity=[c.path||key,c.name,...(c.labels||[])].join(' ');
    if(!/continue|collect|confirm|next|finish|close|accept|ok|result/i.test(identity))continue;
    // Never initiate another purchase while handling a purchase outcome.
    if(/buyfeature|purchasewindow\/content\/options|confirmbuy/i.test(identity.replaceAll(' ','')))continue;
    seen.add('button:'+key);
    acts.push({action_id:'button:'+key,kind:'button',key,
     fingerprint:c.fingerprint,label:String(c.name||key).slice(0,120),priority:50});
   }
   if(status!=='READY_FOR_VERIFICATION'){
    acts.push({action_id:'advance_protocol',kind:'advance',
      label:'Observed provider continuation (requires review)',priority:10});
    acts.push({action_id:'continue_center',kind:'continue',
      label:'Visible overlay continuation (requires screenshot review)',priority:-100});
   }
   if(status==='READY_FOR_VERIFICATION')
    acts.push({action_id:'verify_normal_spin',kind:'spin',
     label:'One normal DEMO spin to verify return to base',priority:75});
  }
  // After a verified normal spin, another random bonus may trigger. Do not
  // silently select its picks or claim completion before terminal controls.
  if(verificationSequence!==null&&!choiceList.length&&status!=='COMPLETE'){
   acts.push({action_id:'advance_protocol',kind:'advance',
    label:'Observed provider continuation (requires review)',priority:10});
   acts.push({action_id:'continue_center',kind:'continue',
    label:'Visible overlay continuation (requires screenshot review)',priority:-100});
  }
  return acts.sort((a,b)=>b.priority-a.priority);
 }
 function build(snapshot){
  current=snapshot;
  const status=now()>deadline?'DEADLINE':actions>=maxActions?'ACTION_LIMIT':stateFor(snapshot);
  const controls=choicesFor(snapshot,status);
  const token=randomUUID();
  view={status,token,tab_id:snapshot.evidence?.tab_id||null,
   capture_id:snapshot.evidence?.capture_id||null,
   screenshot:snapshot.evidence?.full_path||null,
   state_key:snapshot.key,sequence:snapshot.operation?.sequence||0,
   purchaseAcknowledged:purchased,verified,readyTicks,
   possibleActions:status==='COMPLETE'||status==='DEADLINE'||status==='ACTION_LIMIT'?[]:controls,
   note:'Read screenshot before choosing. No automatic bonus pick or buy retry.'};
  return view;
 }
 async function observe(){
  if(closed||busy)throw Error('LIVE_BRANCH_UNAVAILABLE');
  busy=true;
  try{return build(await session.snapshot({forceCapture:true}));}
  finally{busy=false;}
 }
 async function act({token,action_id,reason=null}={}){
  if(closed||busy)throw Error('LIVE_BRANCH_UNAVAILABLE');
  if(token!==view?.token)return {status:'STALE_DECISION',clicked:false};
  const selected=view.possibleActions.find(x=>x.action_id===action_id);
  if(!selected)return {status:'INVALID_ACTION',clicked:false};
  busy=true;
  try{
   const fresh=await session.snapshot();
   if(fresh.key!==current.key||fresh.operation?.sequence!==current.operation?.sequence)
    return {status:'STATE_CHANGED',clicked:false,view:build(fresh)};
   let answer;
   if(selected.kind==='picker'){
    const picker=(fresh.choices||[]).find(x=>x.key===selected.key&&x.event===selected.event);
    if(!picker)return {status:'CHOICE_CHANGED',clicked:false,view:build(fresh)};
    answer=await session.choose(picker);
   }else if(selected.kind==='button'){
    const button=(fresh.controls||[]).find(x=>x.key===selected.key&&x.fingerprint===selected.fingerprint);
    if(!button)return {status:'CONTROL_CHANGED',clicked:false,view:build(fresh)};
    answer=await session.click(button);
   }else if(selected.kind==='stop'){
    const sequence=fresh.operation?.sequence||0;
    if(!purchased||fresh.flags?.stopActive!==true||
       fresh.flags?.logicIsFreeSpin!==true||stoppedSpins.has(sequence))
     return {status:'STOP_UNAVAILABLE_OR_ALREADY_SENT',clicked:false,view:build(fresh)};
    const control=(fresh.controls||[]).filter(c=>c.key===selected.key&&
     c.fingerprint===selected.fingerprint&&
     (c.handlers||[]).some(h=>h.event==='Evt_DataToCode_Pressed_Stop'));
    if(control.length!==1)return {status:'STOP_CONTROL_CHANGED',clicked:false,view:build(fresh)};
    answer=await session.click(control[0]);
    if(answer?.ok!==false)stoppedSpins.add(sequence);
   }else if(selected.kind==='spin'){
    if(!purchased||verificationSequence!==null||readyTicks<2||!normalControlsReady(fresh))
     return {status:'SPIN_NOT_READY',clicked:false,view:build(fresh)};
    verificationSequence=fresh.operation.sequence;
    readyTicks=0; // Require two stable post-verification observations, never carry pre-spin ticks.
    verificationStartedAt=now();
    answer=await session.spinNormal(fresh);
   }else if(selected.kind==='advance'){
    if((fresh.choices||[]).length||!purchased)return {status:'ADVANCE_NOT_READY',clicked:false,view:build(fresh)};
    answer=await session.advance(fresh);
    if(answer?.kind==='WAIT')return {status:'NO_PROVIDER_CONTINUATION',clicked:false,view:build(fresh)};
   }else if(selected.kind==='continue'){
    if((fresh.choices||[]).length||!purchased)return {status:'CONTINUE_NOT_READY',clicked:false,view:build(fresh)};
    answer=await session.clickCenter(fresh);
   }
   if(answer?.ok===false){
    if(selected.kind==='spin'){verificationSequence=null;verificationStartedAt=null;}
    return {status:'ACTION_REJECTED',clicked:false,reason:answer.reason||'PROVIDER_REJECTED',view:build(fresh)};
   }
   actions++;
   const next=await session.snapshot({forceCapture:true});
   await record({action_id:selected.action_id,kind:selected.kind,
    reason:typeof reason==='string'?reason.slice(0,256):null,
    before_key:fresh.key,after_key:next.key,at:new Date().toISOString()});
   return {status:'EXECUTED',clicked:true,view:build(next)};
  }finally{busy=false;}
 }
 function close(){
  closed=true;
  return value();
 }
 function peek(){return value();}
 return {observe,act,close,peek};
}
