import {filterKnownControls} from './known-controls.js';
import {createNavigationKey} from './state-explorer.js';
import {sanitizeTransportUrl,sanitizeTransportText} from '../../lib/parser-common.js';

/** Protocol evidence marks the submission boundary. Random bonus values are not graph keys. */
export function operationStateFromEntries(entries,{afterSequence,verificationAfterSequence}={}){
 const protocol=entries.filter(e=>/\/gameService(?:\?|$)/.test(e.request?.url||'')&&new URLSearchParams(e.request?.postData?.text||'').has('action'));
 const spins=protocol.filter(e=>new URLSearchParams(e.request.postData.text).get('action')==='doSpin');
 const latest=spins.at(-1),last=protocol.at(-1);
 const response=e=>{const c=e?.response?.content;return c?.encoding==='base64'?Buffer.from(c.text||'','base64').toString():c?.text||'';};
 const body=response(last),fields=new URLSearchParams(body);
 const kindOf=e=>{const request=new URLSearchParams(e.request.postData.text);return request.has('pur')&&Number(request.get('pur'))>=0?'purchase':'spin';};
 const acknowledgement=e=>{const f=new URLSearchParams(response(e)),next=f.get('na');return {responseNextAction:next,protocolAccepted:['s','c','b','m','fso','fss'].includes(next)&&!['error','errorCode','error_code','err'].some(k=>f.has(k)&&!['','0','false'].includes(f.get(k)))};};
 const transaction=e=>e?{kind:kindOf(e),...acknowledgement(e),status:e.response?.status||0,complete:e._fuzzerPending!==true&&!e.response?._error&&e.response?.status===200&&!!response(e),endpoint:sanitizeTransportUrl(e.request.url),payload:Object.fromEntries(new URLSearchParams(sanitizeTransportText(e.request.postData.text)))}:null;
 const kind=latest?kindOf(latest):null;
 // The boundary is the spin count before the action, not the latest bonus spin.
 const submitted=Number.isInteger(afterSequence)&&afterSequence>=0?spins[afterSequence]:null;
 const verified=Number.isInteger(verificationAfterSequence)&&verificationAfterSequence>=0?spins[verificationAfterSequence]:null;
 return {sequence:spins.length,protocolSequence:protocol.length,kind,
   transaction:transaction(latest),
   ...(afterSequence===undefined?{}:{submission:submitted?{sequence:afterSequence+1,...transaction(submitted)}:null}),
   ...(verificationAfterSequence===undefined?{}:{verification:verified?{sequence:verificationAfterSequence+1,...transaction(verified)}:null}),
   protocolComplete:!protocol.some(e=>e._fuzzerPending===true||e.response?._error)&&last?.response?.status===200&&!!body,nextAction:fields.get('na'),
   cascadeActive:String(fields.get('rs_c')??'').split(',').some(v=>v.trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0)};
}

function normalControlBlockers(s){
 const f=s.flags||{},o=s.operation||{};
 const blockers=[];
 if(s.capture?.pending===true)blockers.push('CAPTURE_PENDING');
 if(s.capture?.uncertain===true)blockers.push('CAPTURE_UNCERTAIN');
 if(f.canSpin!==true)blockers.push('CAN_SPIN_NOT_READY');
 for(const [flag,reason]of [['logicIsFreeSpin','FREE_SPINS_ACTIVE'],['respinInProgress','RESPIN_ACTIVE'],['spinBlockingFeatureIsRunning','FEATURE_BLOCKING'],['stopActive','STOP_ACTIVE'],['lastWinIsCounting','WIN_COUNTING'],['waitInResultForBigWin','BIG_WIN_PENDING']])if(f[flag])blockers.push(reason);
 if(f.stages?.includes('StageSpin'))blockers.push('SPIN_STAGE_ACTIVE');
 if(s.wager?.menuOpen)blockers.push('PURCHASE_MENU_OPEN');
 if((s.choices||[]).length)blockers.push('VISIBLE_CHOICES_PENDING');
 if(o.transaction?.complete!==true)blockers.push('SPIN_RESPONSE_INCOMPLETE');
 if(o.protocolComplete!==true)blockers.push('PROTOCOL_RESPONSE_INCOMPLETE');
 if(o.cascadeActive)blockers.push('CASCADE_ACTIVE');
 if(!['s','c'].includes(o.nextAction))blockers.push('PROTOCOL_NOT_READY');
 return blockers;
}
export function normalControlsReady(s){return normalControlBlockers(s).length===0;}

const diagnosticFlags=['canSpin','logicIsFreeSpin','respinInProgress','spinBlockingFeatureIsRunning','stopActive','lastWinIsCounting','waitInResultForBigWin','confirmFSActive','fsStartNeedsConfirmation','mustOpenBonus','mustOpenAnotherBonus','mustResumeFreeSpinOptions','manualRespin'];
const diagnosticStages=new Set(['StageSpin','StageResult','StageResultFreeSpin']);
const stageFlags=['mustSpin','fsStartConfirmed','shouldEnterFS','freeSpinsEnded','changeToResult','spinEnded'];
const bool=value=>typeof value==='boolean'?value:null;
const count=value=>Number.isInteger(value)&&value>=0?value:null;
const code=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,95}$/.test(value)?value:'UNKNOWN';
const copyTransaction=t=>({...t,payload:t.payload?{...t.payload}:undefined});
const boundedText=value=>typeof value==='string'?sanitizeTransportText(value.replace(/((?:sid|session|token|mgckey|launch_token)=)[^&\s]+/gi,'$1[redacted]'),256)?.slice(0,256):null;
function continuationOutcome(kind,outcome,timeMs){return {kind,ok:bool(outcome?.ok),...(outcome?.reason===undefined?{}:{reason:boundedText(outcome.reason)}),timeMs};}

export function visibleOperationChoices(pickers,drawings,{fallback=false,excludedPaths=[]}={}){
 const precise= (pickers||[]).filter(c=>c.active===true).flatMap(c=>{
   const drawing=(drawings||[]).find(b=>b.enabled!==false&&b.root===c.root&&b.hit_rect&&b.handlers?.some(h=>h.kind==='XTButton'&&h.index===c.index&&h.event===c.event));
   return drawing?[{...c,key:JSON.stringify([c.root,c.index,c.name,c.event]),labels:drawing.labels||[],path:drawing.path}]:[];
 });
 if(precise.length||!fallback)return precise;
 const excluded=new Set(excludedPaths);
 return filterKnownControls((drawings||[]).filter(b=>b.enabled!==false&&!excluded.has(b.path)),{requireHitRect:true}).keep.map(b=>({
  key:'drawn:'+b.path,path:b.path,name:b.name,labels:b.labels||[],physical:true
 }));
}

/** Complete one submitted operation. Only choice alternatives form a family; reels/results do not. */
export async function finishOperation(a,before,initial,{choicePlan=[],deadline=Infinity,timeoutMs,pollMs=500,verifyPurchase=true,stallMs=Infinity,choiceDwellMs=0,recoveryQuietMs=1000,recoveryGapMs=2000,probeIdleMs=0,probeResponseMs=10000}={}){
 if(!(stallMs>0)||!(Number.isFinite(stallMs)||stallMs===Infinity))throw Error('INVALID_STALL_LIMIT');
 if(!Number.isSafeInteger(probeIdleMs)||probeIdleMs<0||!Number.isSafeInteger(probeResponseMs)||probeResponseMs<1)throw Error('INVALID_EXIT_PROBE_LIMIT');
 // Empirical mode follows healthy progress within the existing campaign cap.
 // An explicit operation limit is still honored; strict/unbounded callers keep
 // the legacy fallback. Quiet/stall and response-probe limits remain separate.
 timeoutMs??=probeIdleMs>0&&Number.isFinite(deadline)?Math.max(1,deadline-a.now()):180000;
 const started=a.now(),until=Math.min(started+timeoutMs,deadline),sequenceBefore=before?.operation?.sequence||0;
 const initialOperation=initial.operation||{},anchored=Object.hasOwn(initialOperation,'submission');
 const original=anchored?initialOperation.submission:initialOperation.sequence===sequenceBefore+1&&initialOperation.transaction?{sequence:initialOperation.sequence,...initialOperation.transaction}:null;
 const submission=original?copyTransaction(original):null;
 const kind=submission?.kind||initialOperation.kind||'spin';
 const decisions=[],verificationChoices=[],continuations=[];
 let current=initial,assessedSnapshot=initial,assessedAt=null,traffic=initial.traffic,lastTraffic=started,lastCenter=started,lastAdvance=started,choiceMarker=null,readyTicks=0,verificationSequence=null,verification=null,verificationAvailable=false,controlUnavailable=false,lastSpinAt=-Infinity,lastSpinAttempt=null,phase='operation_completion';
 let lastProgress=started,progressKey=null,lastCenterProgress=null,lastAdvanceProgress=null,choiceCandidate=null,lastRecoveryInput=started;
 let empiricalRequired=probeIdleMs>0&&kind==='purchase',probeKey=null,probeChangedAt=started,probeTriedKey=null,probeSentAt=null,closureEvidence=null,verificationNextOperation=null,probeAttempts=0;
 const completion=()=>{
   const f=current.flags||{},o=current.operation||{},blockers=normalControlBlockers(current);
   if(!submission||submission.sequence!==sequenceBefore+1||anchored&&o.submission?.sequence!==submission.sequence)blockers.push('SUBMISSION_NOT_OBSERVED');
   else{if(submission.status>=400)blockers.push('SUBMISSION_SERVER_ERROR');if(submission.complete!==true)blockers.push('SUBMISSION_RESPONSE_INCOMPLETE');}
   if(lastSpinAttempt?.ok===false||controlUnavailable)blockers.push('NORMAL_SPIN_CONTROL_UNAVAILABLE');
   if(verificationSequence!==null){
     if(!verificationAvailable)blockers.push('VERIFICATION_REQUEST_NOT_OBSERVED');
     if(verification){if(verification.kind!=='spin')blockers.push('VERIFICATION_NOT_NORMAL_SPIN');if(verification.status>=400)blockers.push('VERIFICATION_SERVER_ERROR');if(verification.complete!==true)blockers.push('VERIFICATION_RESPONSE_INCOMPLETE');}
   }
   if(!blockers.length&&readyTicks<2)blockers.push('READINESS_NOT_STABLE');
   return {
     phase,blockers:closureEvidence?[]:[...new Set(blockers)],...(closureEvidence?{observedRuntimeBlockers:[...new Set(blockers)]}:{}),
     readiness:{ticks:Math.min(readyTicks,2),requiredTicks:2,quietMs:assessedAt===null?0:Math.min(timeoutMs,Math.max(0,assessedAt-lastTraffic)),assessedAtMs:assessedAt===null?null:Math.min(timeoutMs,Math.max(0,assessedAt-started))},
     flags:{...Object.fromEntries(diagnosticFlags.map(k=>[k,bool(f[k])])),stages:[...new Set((Array.isArray(f.stages)?f.stages:[]).filter(k=>diagnosticStages.has(k)))]},
     stageDetails:(Array.isArray(current.stageDetails)?current.stageDetails:[]).filter(s=>diagnosticStages.has(s.name)).slice(0,3).map(s=>({name:s.name,...Object.fromEntries(stageFlags.map(k=>[k,bool(s[k])]))})),
     protocol:{sequence:count(o.sequence),protocolSequence:count(o.protocolSequence),kind:['spin','purchase'].includes(o.kind)?o.kind:null,transactionStatus:Number.isInteger(o.transaction?.status)?o.transaction.status:null,transactionComplete:bool(o.transaction?.complete),protocolComplete:bool(o.protocolComplete),nextAction:['s','c','m','b','fso','fss'].includes(o.nextAction)?o.nextAction:o.nextAction===null||o.nextAction===undefined?null:'OTHER',cascadeActive:bool(o.cascadeActive)},
     exitSurface:current.exitSurface?{clear:bool(current.exitSurface.clear),reason:code(current.exitSurface.reason),pendingCount:current.exitSurface.pendingPaths?.length??0}:null,lastSpinAttempt,boundaries:{submissionAfterSequence:count(sequenceBefore),verificationAfterSequence:count(verificationSequence)},
     evidence:Object.fromEntries(['tab_id','capture_id','full_path','artifact_dir'].filter(k=>['string','number'].includes(typeof current.evidence?.[k])).map(k=>[k,current.evidence[k]]))
   };
 };
 const result=(ok,reason)=>({ok,reason,kind,normalSpinVerified:ok&&(!!closureEvidence||kind!=='purchase'||verifyPurchase),verificationRequired:empiricalRequired||verifyPurchase&&kind==='purchase',closureEvidence,verificationNextOperation,decisions,verificationChoices,continuations,elapsedMs:a.now()-started,snapshot:current,submission,verification,completion:completion()});
 if(!submission||submission.sequence!==sequenceBefore+1)return result(false,'OPERATION_SUBMISSION_UNAVAILABLE');
 while(a.now()<until){
   const now=a.now();if(current.traffic!==traffic){traffic=current.traffic;lastTraffic=now;readyTicks=0;}
   const op=current.operation||{},choices=current.choices||[],busy=current.flags?.stages?.includes('StageSpin');
   const liveSubmission=anchored?op.submission:op.sequence===submission.sequence?op.transaction:null;
   if(liveSubmission&&(!anchored||liveSubmission.sequence===submission.sequence)){
     submission.status=liveSubmission.status;submission.complete=liveSubmission.complete;submission.protocolAccepted=liveSubmission.protocolAccepted;
   }
   if(verificationSequence!==null){
     const liveVerification=Object.hasOwn(op,'verification')?op.verification:op.sequence===verificationSequence+1&&op.transaction?{sequence:op.sequence,...op.transaction}:null;
     verificationAvailable=liveVerification?.sequence===verificationSequence+1;
     if(verificationAvailable){
       if(!verification)verification=copyTransaction(liveVerification);
       else{verification.status=liveVerification.status;verification.complete=liveVerification.complete;verification.protocolAccepted=liveVerification.protocolAccepted;verification.responseNextAction=liveVerification.responseNextAction;}
     }
     phase=verification?'verification_response':'verification_request';
   }
   if(submission.status>=400||verification?.status>=400||op.transaction?.status>=400)return result(false,'OPERATION_SERVER_ERROR');
   const submissionAvailable=!anchored||liveSubmission?.sequence===submission.sequence;
   const normalReady=submissionAvailable&&submission.complete===true&&normalControlsReady(current);
   readyTicks=normalReady?readyTicks+1:0;
   assessedSnapshot=current;assessedAt=now;
   const observedProgress=JSON.stringify([createNavigationKey(current),op.sequence,op.protocolSequence,op.nextAction,op.protocolComplete,op.cascadeActive,current.capture?.pending,current.capture?.uncertain,current.flags,current.wager?.menuOpen,choices.map(c=>c.key)]);
   if(observedProgress!==progressKey){progressKey=observedProgress;lastProgress=now;}
   // A completed response that explicitly advertises a decision is an open
   // traversal frontier, not a stalled operation. The panel may be animated in
   // later; keep observing until choices appear or the absolute operation/global
   // deadline expires. Generic operations still use the short stall budget.
   const advertisedChoicePending=op.protocolComplete===true&&['b','m','fso'].includes(op.nextAction)&&!choices.length;
   // Empirical exit uses observed UI + game traffic, not stale lifecycle flags.
   // The actual base-control input is performed by a separately revalidated adapter.
   if(probeIdleMs>0&&(choices.length||['b','m','fso'].includes(op.nextAction)||current.flags?.logicIsFreeSpin===true||current.flags?.respinInProgress===true))empiricalRequired=true;
   const exitProgress=JSON.stringify([op.sequence,op.protocolSequence,op.nextAction,op.protocolComplete,current.capture?.marker,current.capture?.pending,current.capture?.uncertain,current.exitSurface?.key,choices.map(c=>c.key)]);
   if(probeKey!==exitProgress){probeKey=exitProgress;probeChangedAt=now;}
   if(empiricalRequired&&probeSentAt!==null){
     if(verificationAvailable&&verification?.complete===true&&current.capture?.uncertain!==true){
       if(verification.kind!=='spin')return result(false,'EXIT_PROBE_NOT_NORMAL');
       if(verification.protocolAccepted===false)return result(false,'EXIT_PROBE_REJECTED');
       if(decisions.length<choicePlan.length)return result(false,'CHOICE_NOT_OBSERVED');
       closureEvidence={basis:'OBSERVED_NORMAL_SPIN',control:lastSpinAttempt.control,sequence:verification.sequence,protocolSequenceBefore:lastSpinAttempt.protocolSequenceBefore};
       verificationNextOperation={sequence:verification.sequence,nextAction:verification.responseNextAction??op.nextAction,complete:false,requiresInteraction:['b','m','fso'].includes(verification.responseNextAction??op.nextAction)};
       phase='complete';return result(true,'OPERATION_COMPLETE');
     }
     // No second input can accidentally provide the proof for the first click.
     // In particular, a new prompt is evidence of interaction, not of a new spin.
     if(choices.length&&current.capture?.pending===false&&current.capture?.uncertain!==true){
       continuations.push({kind:'EXIT_PROBE_REVEALED_INTERACTION',ok:true,timeMs:now-started});
       // The input opened a prompt instead of starting a round. Follow its
       // observed alternatives, invalidating this proof epoch before any input.
       probeSentAt=null;verificationSequence=null;verification=null;verificationAvailable=false;
       controlUnavailable=true;lastRecoveryInput=now;phase='operation_completion';
       await a.sleep(Math.min(pollMs,Math.max(0,until-a.now())));current=await a.snapshot();continue;
     }
     if(current.wager?.menuOpen)return result(false,'EXIT_PROBE_INTERACTION_REQUIRED');
     if(now-probeSentAt>=probeResponseMs)return result(false,'EXIT_PROBE_NO_RESPONSE');
     await a.sleep(Math.min(pollMs,Math.max(0,until-a.now())));current=await a.snapshot();continue;
   }
   if(empiricalRequired&&submissionAvailable&&submission.complete===true&&
      current.capture?.pending===false&&current.capture?.uncertain!==true&&op.protocolComplete===true&&
      !advertisedChoicePending&&!choices.length&&!current.wager?.menuOpen&&current.exitSurface?.clear===true&&
      now-Math.max(probeChangedAt,lastRecoveryInput)>=probeIdleMs&&probeTriedKey!==probeKey){
     if(probeAttempts>=2)return result(false,'EXIT_PROBE_LIMIT');
     probeTriedKey=probeKey;phase='exit_probe_control';
     let spin;try{spin=await a.spinNormal(current,{empirical:true,deadline:until});}
     catch{spin={ok:false,clicked:true,reason:'EXIT_PROBE_CLICK_UNCONFIRMED'};}
     lastSpinAttempt={ok:bool(spin?.ok),clicked:bool(spin?.clicked),retryable:spin?.retryable===true,
       reason:spin?.reason===undefined?null:code(spin.reason),sequenceBefore:count(spin?.sequenceBefore),
       protocolSequenceBefore:count(spin?.protocolSequenceBefore),control:boundedText(spin?.control),empirical:true,timeMs:now-started};
     lastSpinAt=lastRecoveryInput=a.now();
     if(spin?.ok===true&&spin.clicked===true&&spin.empirical===true){
       verificationSequence=spin.sequenceBefore;
       if(count(verificationSequence)===null)return result(false,'VERIFICATION_BOUNDARY_UNAVAILABLE');
       probeAttempts++;probeSentAt=a.now();controlUnavailable=false;phase='verification_request';
       if(a.now()>=until)break;
       await a.sleep(Math.min(pollMs,until-a.now()));current=await a.snapshot();continue;
     }
     if(spin?.clicked!==false)return result(false,'EXIT_PROBE_CLICK_UNCONFIRMED');
     controlUnavailable=true;
     // The preflight may have observed a new UI: never recover from its old snapshot.
     if(a.now()>=until)break;
     await a.sleep(Math.min(pollMs,until-a.now()));current=await a.snapshot();continue;
   }
   if(!advertisedChoicePending&&now-lastProgress>=stallMs)return result(false,'OPERATION_STALLED');
   if(readyTicks>=2&&!empiricalRequired){
     if(verificationSequence===null){
       if(decisions.length<choicePlan.length)return result(false,'CHOICE_NOT_OBSERVED');
       if(!verifyPurchase||kind!=='purchase'){phase='complete';return result(true,'OPERATION_COMPLETE');}
       phase='verification_control';
       if(!controlUnavailable||now-lastSpinAt>=2000){
         const spin=await a.spinNormal(current);lastSpinAt=now;
         lastSpinAttempt={ok:bool(spin?.ok),clicked:bool(spin?.clicked),retryable:spin?.retryable===true,reason:spin?.reason===undefined?null:code(spin.reason),sequenceBefore:count(spin?.sequenceBefore),timeMs:now-started};
         if(spin?.ok===true&&spin.clicked!==false){
           verificationSequence=spin.sequenceBefore??op.sequence;
           if(count(verificationSequence)===null)return result(false,'VERIFICATION_BOUNDARY_UNAVAILABLE');
           controlUnavailable=false;phase='verification_request';
         }else if(spin?.ok===false&&spin.clicked===false&&spin.retryable===true)controlUnavailable=true;
         else return result(false,'NORMAL_SPIN_CONTROL_UNAVAILABLE');
         readyTicks=0;
       }
     }else if(verificationAvailable&&verification?.kind==='spin'&&verification.complete===true){phase='complete';return result(true,'OPERATION_COMPLETE');}
   }else if(choices.length&&current.capture?.pending!==true&&current.capture?.uncertain!==true&&(verifyPurchase||probeIdleMs>0||!busy||op.protocolComplete===true&&['b','fso'].includes(op.nextAction))){
     const layout=JSON.stringify(choices.map(c=>[c.key,c.labels||[]])),sequence=op.protocolSequence??op.sequence,captureMarker=current.capture?.marker??null;
     // A response that says spin/collect can precede disappearance of the old
     // panel. Only a completed exchange asking for another choice re-arms it.
     const nextDecision=op.protocolComplete===true&&['b','m','fso'].includes(op.nextAction);
     if(layout!==choiceMarker?.layout||nextDecision&&sequence!==choiceMarker?.sequence){
       if(choiceCandidate?.layout!==layout||choiceCandidate?.sequence!==sequence||choiceCandidate?.captureMarker!==captureMarker)choiceCandidate={layout,sequence,captureMarker,since:now};
       if(now-choiceCandidate.since>=choiceDwellMs){
         const planned=verificationSequence===null?choicePlan[decisions.length]:null;
         const selected=planned?choices.find(c=>c.key===planned):choices[0];
         const family=verificationSequence===null?decisions:verificationChoices;
         const id=JSON.stringify(family.map(d=>d.selected));
         const decision={id,parent:family.at(-1)?.id??null,options:choices.map(({key,name,event,labels})=>({key,name,event,labels})),selected:null,attempted:selected?.key??null,evidence:current.evidence};
         // Discovery precedes execution: even an unavailable/uncertain choice
         // must leave all its observed siblings available to the replay scheduler.
         family.push(decision);
         if(!selected)return result(false,'CHOICE_NOT_AVAILABLE');
         if(a.now()>=until)break;
         let action;try{action=await a.choose(selected);}catch{action={ok:false};}if(action?.ok!==true)return result(false,'CHOICE_ACTION_FAILED');
         decision.selected=selected.key;choiceMarker={layout,sequence};choiceCandidate=null;lastCenter=lastAdvance=lastRecoveryInput=a.now();
       }
     }else choiceCandidate=null;
   }else choiceCandidate=null;
   // An accepted click may still have an uncaptured request. Never advance on
   // the preceding protocol exchange while that verification boundary is empty.
   const verificationRequestPending=verificationSequence!==null&&!verificationAvailable;
   const recoveryAllowed=!(empiricalRequired&&current.exitSurface?.clear===true&&!controlUnavailable)&&!advertisedChoicePending&&current.capture?.pending!==true&&current.capture?.uncertain!==true&&!verificationRequestPending&&!choices.length&&!current.wager?.menuOpen&&(!normalReady||controlUnavailable||empiricalRequired&&current.exitSurface?.clear!==true);
   // Recovery inputs share the same UI/protocol dwell and cooldown. A center
   // fallback must not bypass a new response, a changed UI, or a recent Stop.
   const recoveryStable=now-Math.max(lastTraffic,lastProgress)>=recoveryQuietMs;
   const recoveryCooled=now-lastRecoveryInput>=recoveryGapMs;
   let advanced=false;
   if(a.now()>=until)break;
   if((!busy||!verifyPurchase&&current.flags?.stopActive===true)&&recoveryAllowed&&op.protocolComplete&&recoveryStable&&recoveryCooled&&now-lastAdvance>=recoveryGapMs&&lastAdvanceProgress!==progressKey){
     const r=await a.advance?.(current,{deadline:until});if(r)continuations.push(continuationOutcome(typeof r.kind==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(r.kind)?r.kind:'UNKNOWN',r,now-started));lastAdvance=now;
     if(r?.clicked===true&&r.ok!==true)return result(false,'CONTINUATION_ACTION_UNCONFIRMED');
     advanced=r?.ok===true&&r.kind!=='WAIT';if(advanced){lastAdvanceProgress=progressKey;lastRecoveryInput=a.now();}
   }
   // An awaited continuation may consume the deadline or change the UI.
   // Never dispatch a second input using its predecessor's observation.
   if(a.now()>=until)break;
   // Preserve the click latch across a transiently hidden panel. Only a new
   // layout or a completed new choice exchange can rearm this decision.
   // StageSpin can remain active behind an intro overlay. Neither that flag
   // nor unrelated background controls may suppress "click to continue".
   if(!advanced&&recoveryAllowed&&recoveryStable&&recoveryCooled&&now-lastCenter>=5000&&lastCenterProgress!==progressKey){const r=await a.clickCenter?.();continuations.push(continuationOutcome('CENTER_CLICK',r,now-started));lastCenter=lastRecoveryInput=a.now();lastCenterProgress=progressKey;}
   await a.sleep(pollMs);current=await a.snapshot();
 }
 // A snapshot acquired at the deadline was never evaluated by this loop.
 // Keep its predecessor so readiness counters and evidence describe one sample.
 current=assessedSnapshot;
 return result(false,'OPERATION_TIMEOUT');
}
