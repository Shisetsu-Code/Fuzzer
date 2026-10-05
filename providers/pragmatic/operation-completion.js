import {sanitizeTransportUrl,sanitizeTransportText} from '../../lib/parser-common.js';

/** Protocol evidence marks the submission boundary. Random bonus values are not graph keys. */
export function operationStateFromEntries(entries,{afterSequence}={}){
 const protocol=entries.filter(e=>/\/gameService(?:\?|$)/.test(e.request?.url||'')&&new URLSearchParams(e.request?.postData?.text||'').has('action'));
 const spins=protocol.filter(e=>new URLSearchParams(e.request.postData.text).get('action')==='doSpin');
 const latest=spins.at(-1),last=protocol.at(-1);
 const response=e=>{const c=e?.response?.content;return c?.encoding==='base64'?Buffer.from(c.text||'','base64').toString():c?.text||'';};
 const body=response(last),fields=new URLSearchParams(body);
 const kindOf=e=>{const request=new URLSearchParams(e.request.postData.text);return request.has('pur')&&Number(request.get('pur'))>=0?'purchase':'spin';};
 const transaction=e=>e?{kind:kindOf(e),status:e.response?.status||0,complete:e.response?.status===200&&!!response(e),endpoint:sanitizeTransportUrl(e.request.url),payload:Object.fromEntries(new URLSearchParams(sanitizeTransportText(e.request.postData.text)))}:null;
 const kind=latest?kindOf(latest):null;
 // The boundary is the spin count before the action, not the latest bonus spin.
 const submitted=Number.isInteger(afterSequence)&&afterSequence>=0?spins[afterSequence]:null;
 return {sequence:spins.length,protocolSequence:protocol.length,kind,
   transaction:transaction(latest),
   ...(afterSequence===undefined?{}:{submission:submitted?{sequence:afterSequence+1,...transaction(submitted)}:null}),
   protocolComplete:last?.response?.status===200&&!!body,nextAction:fields.get('na'),
   cascadeActive:String(fields.get('rs_c')??'').split(',').some(v=>v.trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0)};
}

export function normalControlsReady(s){
 const f=s.flags||{},o=s.operation||{};
 return f.canSpin===true&&!f.logicIsFreeSpin&&!f.respinInProgress&&!f.spinBlockingFeatureIsRunning&&!f.stopActive&&!f.lastWinIsCounting&&!f.waitInResultForBigWin&&
   !f.stages?.includes('StageSpin')&&!s.wager?.menuOpen&&!(s.choices||[]).length&&o.transaction?.complete===true&&o.protocolComplete===true&&!o.cascadeActive&&['s','c'].includes(o.nextAction);
}

export function visibleOperationChoices(pickers,drawings){
 return (pickers||[]).filter(c=>c.active===true).flatMap(c=>{
   const drawing=(drawings||[]).find(b=>b.root===c.root&&b.hit_rect&&b.handlers?.some(h=>h.kind==='XTButton'&&h.index===c.index&&h.event===c.event));
   return drawing?[{...c,key:JSON.stringify([c.root,c.index,c.name,c.event]),labels:drawing.labels||[],path:drawing.path}]:[];
 });
}

/** Complete one submitted operation. Only choice alternatives form a family; reels/results do not. */
export async function finishOperation(a,before,initial,{choicePlan=[],deadline=Infinity,timeoutMs=180000,pollMs=500}={}){
 const started=a.now(),until=Math.min(started+timeoutMs,deadline),sequenceBefore=before?.operation?.sequence||0;
 const initialOperation=initial.operation||{},anchored=Object.hasOwn(initialOperation,'submission');
 const original=anchored?initialOperation.submission:initialOperation.sequence===sequenceBefore+1&&initialOperation.transaction?{sequence:initialOperation.sequence,...initialOperation.transaction}:null;
 const submission=original?{...original,payload:original.payload?{...original.payload}:undefined}:null;
 const kind=submission?.kind||initialOperation.kind||'spin';
 const decisions=[],verificationChoices=[],continuations=[];
 let current=initial,traffic=initial.traffic,lastTraffic=started,lastCenter=started,lastAdvance=started,choiceMarker=null,readyTicks=0,verificationSequence=null;
 const result=(ok,reason)=>({ok,reason,kind,normalSpinVerified:ok,verificationRequired:kind==='purchase',decisions,verificationChoices,continuations,elapsedMs:a.now()-started,snapshot:current,submission,verification:verificationSequence===null?null:current.operation?.transaction});
 if(!submission||submission.sequence!==sequenceBefore+1)return result(false,'OPERATION_SUBMISSION_UNAVAILABLE');
 while(a.now()<until){
   const now=a.now();if(current.traffic!==traffic){traffic=current.traffic;lastTraffic=now;readyTicks=0;}
   const op=current.operation||{},choices=current.choices||[],busy=current.flags?.stages?.includes('StageSpin');
   const liveSubmission=anchored?op.submission:op.sequence===submission.sequence?op.transaction:null;
   if(liveSubmission&&(!anchored||liveSubmission.sequence===submission.sequence)){
     submission.status=liveSubmission.status;submission.complete=liveSubmission.complete;
   }
   if(submission.status>=400||op.transaction?.status>=400)return result(false,'OPERATION_SERVER_ERROR');
   const submissionAvailable=!anchored||liveSubmission?.sequence===submission.sequence;
   const normalReady=submissionAvailable&&submission.complete===true&&normalControlsReady(current);
   readyTicks=normalReady?readyTicks+1:0;
   if(readyTicks>=2){
     if(verificationSequence===null){
       if(decisions.length<choicePlan.length)return result(false,'CHOICE_NOT_OBSERVED');
       if(kind!=='purchase')return result(true,'OPERATION_COMPLETE');
       verificationSequence=op.sequence;
       const spin=await a.spinNormal(current);
       if(spin?.ok!==true)return result(false,'NORMAL_SPIN_CONTROL_UNAVAILABLE');
       readyTicks=0;
     }else if(op.sequence>verificationSequence&&op.transaction?.kind==='spin')return result(true,'OPERATION_COMPLETE');
   }else if(choices.length){
     const marker=JSON.stringify(choices.map(c=>[c.key,c.labels||[]]));
     if(marker!==choiceMarker){
       const planned=verificationSequence===null?choicePlan[decisions.length]:null;
       const selected=planned?choices.find(c=>c.key===planned):choices[0];
       if(!selected)return result(false,'CHOICE_NOT_AVAILABLE');
       const family=verificationSequence===null?decisions:verificationChoices;
       const id=JSON.stringify(family.map(d=>d.selected));
       const decision={id,parent:family.at(-1)?.id??null,options:choices.map(({key,name,event,labels})=>({key,name,event,labels})),selected:selected.key,evidence:current.evidence};
       const action=await a.choose(selected);if(action?.ok!==true)return result(false,'CHOICE_ACTION_FAILED');
       family.push(decision);choiceMarker=marker;lastCenter=lastAdvance=now;
     }
   }else if(!busy&&!normalReady&&op.protocolComplete&&now-lastTraffic>=1000){
     if(now-lastAdvance>=2000){const r=await a.advance?.(current);if(r)continuations.push({kind:r.kind,ok:r.ok,timeMs:now-started});lastAdvance=now;}
   }
   if(!choices.length)choiceMarker=null;
   // StageSpin can remain active behind an intro overlay. Neither that flag
   // nor unrelated background controls may suppress "click to continue".
   if(!choices.length&&!normalReady&&now-lastCenter>=5000&&now-lastTraffic>=1000){await a.clickCenter?.();continuations.push({kind:'CENTER_CLICK',timeMs:now-started});lastCenter=now;}
   await a.sleep(pollMs);current=await a.snapshot();
 }
 return result(false,'OPERATION_TIMEOUT');
}
