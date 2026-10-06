import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {createHardFireSession} from './session.js';import {captureDrawnButtons} from './drawn-buttons.js';import {inspectDrawnButtons} from '../../providers/pragmatic/drawn-buttons.js';import {filterKnownControls} from '../../providers/pragmatic/known-controls.js';import {exploreStates} from '../../providers/pragmatic/state-explorer.js';
import {consolidateHars} from './har-consolidation.js';
import {chooseHitPoint} from '../../providers/pragmatic/hit-point.js';
import {withSurfaceLock,ensurePainted} from './paint-guard.js';
import {wagerEvidence,readRuntimeBalance,baseSurfaceMatches,parseProtocolMoney,classifySpinDebit} from '../../providers/pragmatic/wager-evidence.js';
import {waitTransition} from '../../providers/pragmatic/state-explorer.js';
import {operationStateFromEntries,finishOperation,visibleOperationChoices} from '../../providers/pragmatic/operation-completion.js';
import {measure,independent,createBenchmark,withBenchmark} from '../../lib/performance.js';
async function runStateExplorerImpl(controller,{gameUrl,artifactDir,maxActions=20,maxDepth=4,timeoutMs=600000,mode='actions',onProgress,onOwnedTab,onClosedTab}={}){
 if(!['actions','strict'].includes(mode))throw Error('INVALID_EXPLORATION_MODE');
 const actionMode=mode==='actions',deadline=Date.now()+timeoutMs;
 let session,lastEvidence,lastKey,lastCapture=0,rootSurface=null,rootConfiguration=null,lastActionAt=0,operationBoundary=null,verificationBoundary=null;const savedHars=[],branchCaptures=[];let terminalCaptured=false,observationId=0;
 const close=async()=>{
  if(!session)return;const owned=session;
  if(actionMode&&!terminalCaptured){terminalCaptured=true;try{const image=await measure('branch.evidence',()=>captureDrawnButtons(controller,owned.tabId,artifactDir));branchCaptures.push({tab_id:owned.tabId,full_path:image.full_path,capture_id:image.capture_id,role:'branch-close'});}catch{branchCaptures.push({tab_id:owned.tabId,role:'branch-close',error:'EVIDENCE_CAPTURE_FAILED'});}}
  try{await measure('session.close',()=>owned.close());session=null;if(owned.har?.path&&!savedHars.includes(owned.har.path))savedHars.push(owned.har.path);}
  catch(error){error.code='SESSION_CLEANUP_FAILED';error.cleanupError=String(error.cleanupError||error.message);error.retainedTabIds=[...new Set([...(error.retainedTabIds||[]),owned.tabId].filter(id=>id!==undefined))];throw error;}
 };
 const surfaceReady=async()=>{if(actionMode)await controller.tabs.activate(session.tabId);else await ensurePainted(controller,session.tabId);};
 const inputBudget=()=>{if(Date.now()>=deadline)throw Error('DEADLINE');};
 const adapter={now:()=>Date.now(),sleep:ms=>new Promise(r=>setTimeout(r,ms)),reset:async()=>{await close();operationBoundary=null;verificationBoundary=null;session=await measure('session.create',()=>createHardFireSession(controller,{gameUrl,artifactDir,entryOnly:true,liveProtocol:actionMode,onOwnedTab,onClosedTab}));lastKey=null;rootSurface=null;rootConfiguration=null;terminalCaptured=false;await controller.tabs.activate(session.tabId);if(actionMode)await withSurfaceLock(()=>ensurePainted(controller,session.tabId));},
 snapshot:async()=>withSurfaceLock(async()=>{await surfaceReady();const readBoundary=actionMode?measure('runtime.boundary',()=>session.protocolCapture()):null;const [raw,state,wallet,entries,menu]=await measure('snapshot.reads',()=>independent([()=>measure('runtime.controls',()=>session.frame.evaluate(inspectDrawnButtons)),()=>measure('runtime.state',()=>session.provider.protocolState(session.frame)),()=>measure('runtime.balance',()=>session.frame.evaluate(readRuntimeBalance)),()=>measure('runtime.entries',()=>session.entries()),()=>measure('runtime.menu',()=>session.purchaseMenu())]));if(raw.supported===false||!raw.viewport||![raw.viewport.width,raw.viewport.height].every(v=>Number.isFinite(v)&&v>0))throw Error('RUNTIME_SURFACE_UNAVAILABLE');const partition=filterKnownControls(raw.controls||[],{requireHitRect:true}),controls=partition.keep.map(b=>({...b,key:b.path})),unresolved=[...filterKnownControls(raw.unresolved||[]).keep,...partition.unresolved];const flags={stages:state?.stages?.map(s=>s.name).sort(),logicIsFreeSpin:state?.logicIsFreeSpin,respinInProgress:state?.respinInProgress,spinBlockingFeatureIsRunning:state?.spinBlockingFeatureIsRunning,canSpin:state?.canSpin,stopActive:state?.stopActive,lastWinIsCounting:state?.lastWinIsCounting,waitInResultForBigWin:state?.waitInResultForBigWin,confirmFSActive:state?.confirmFSActive,fsStartNeedsConfirmation:state?.fsStartNeedsConfirmation,mustOpenBonus:state?.mustOpenBonus,mustOpenAnotherBonus:state?.mustOpenAnotherBonus,mustResumeFreeSpinOptions:state?.mustResumeFreeSpinOptions,manualRespin:state?.manualRespin};
 const stageDetails=(state?.stages||[]).map(stage=>Object.fromEntries(Object.entries(stage).filter(([key,value])=>key==='name'&&typeof value==='string'||['mustSpin','fsStartConfirmed','shouldEnterFS','freeSpinsEnded','changeToResult','spinEnded'].includes(key)&&typeof value==='boolean')));
 if(wallet.balance===null||wallet.balance===0){for(const entry of [...entries].reverse()){const content=entry.response?.content;if(!content?.text||content.encoding==='base64')continue;const fields=new URLSearchParams(content.text);const value=fields.get('balance');if(value!==null&&value.trim()!==''&&parseProtocolMoney(value)!==null){wallet.balance=parseProtocolMoney(value);wallet.balanceSource='server:balance';break;}}}
 const wager={...wallet,betLevelIndex:state?.betLevelIndex??null,canSpin:state?.canSpin===true,menuOpen:menu.open===true,serverMarker:actionMode?session.protocolCapture().marker:JSON.stringify(controller.withTab(session.tabId).networkEvents())};
 const surface=controls.map(b=>({center:{x:(b.hit_rect.x+b.hit_rect.width/2)/raw.viewport.width,y:(b.hit_rect.y+b.hit_rect.height/2)/raw.viewport.height}}));
 const configuration=JSON.stringify({buttons:controls.map(b=>({path:b.key,labels:b.labels||[],sprites:b.sprite_names})),betLevelIndex:wager.betLevelIndex});
 if(rootSurface===null){rootSurface=surface;rootConfiguration=configuration;}
 wager.probeReady=!unresolved.length&&(actionMode||configuration!==rootConfiguration)&&baseSurfaceMatches(rootSurface,surface)&&!wager.menuOpen&&!state?.logicIsFreeSpin&&!state?.respinInProgress&&!state?.spinBlockingFeatureIsRunning;
 const key=createHash('sha256').update(JSON.stringify({configuration,flags,unresolved:unresolved.map(c=>({path:c.path,reason:c.reason}))})).digest('hex').slice(0,20);
 if(!actionMode&&(key!==lastKey||Date.now()-lastCapture>10000)){lastEvidence=await measure('snapshot.evidence',()=>captureDrawnButtons(controller,session.tabId,artifactDir));lastKey=key;lastCapture=Date.now();}
 // Capture is evidence, not a global network-idle gate. Read one fresh boundary
 // after the screenshot; assets and telemetry never advance this marker.
 const capture=actionMode?session.protocolCapture():null;
 if(capture){wager.serverMarker=capture.marker;for(const b of controls)b.captureMarker=readBoundary?.marker??capture.marker;}
 const traffic=capture?capture.marker:JSON.stringify(controller.withTab(session.tabId).networkEvents());
 const choices=visibleOperationChoices(state?.pickerControls,raw.controls);
 const inputReady=capture?.pending===false&&capture.marker===readBoundary?.marker&&!flags.stages?.includes('StageSpin')&&!flags.lastWinIsCounting&&(wager.menuOpen||choices.length>0||flags.canSpin===true&&!flags.logicIsFreeSpin&&!flags.respinInProgress&&!flags.spinBlockingFeatureIsRunning&&!flags.stopActive);
 return {key,controls,choices,inputReady,capture:capture?{marker:capture.marker,pending:capture.pending,uncertain:capture.uncertain}:null,operation:operationStateFromEntries(capture?.entries||entries,{...(operationBoundary===null?{}:{afterSequence:operationBoundary}),...(verificationBoundary===null?{}:{verificationAfterSequence:verificationBoundary})}),unresolved,traffic,wager,evidence:actionMode?{tab_id:session.tabId,observation_id:++observationId,observed_at:Date.now(),kind:'RUNTIME_OBSERVATION'}:{tab_id:session.tabId,capture_id:lastEvidence.capture_id,full_path:lastEvidence.full_path,artifact_dir:lastEvidence.artifact_dir},flags,stageDetails};}),
 click:async b=>withSurfaceLock(async()=>{await surfaceReady();const fresh=await captureDrawnButtons(controller,session.tabId,artifactDir,{includeUniversal:true,geometryOnly:actionMode});const target=fresh.controls.find(c=>c.path===b.key);if(!target?.center)throw Error('Observed control is no longer available');const point=chooseHitPoint(target,fresh.controls);if(!point)throw Error('AMBIGUOUS_HIT_AREA');if(actionMode){const latest=session.protocolCapture();if(latest.pending||latest.marker!==b.captureMarker)throw Error('ACTION_PROTOCOL_CHANGED');}
 inputBudget();lastActionAt=Date.now();const clicked=await measure('input.click',()=>controller.withTab(session.tabId).click(point.x,point.y));if(clicked?.ok===false)throw Error('ACTION_CLICK_UNCONFIRMED');}),
 clickCenter:async()=>withSurfaceLock(async()=>{await surfaceReady();if(actionMode&&session.protocolCapture().pending)return {ok:false,reason:'CAPTURE_PENDING'};return session.clickContinue();}),
 operationStarted:(before,after)=>(after.operation?.sequence||0)>(before.operation?.sequence||0),
 finishOperation:async(before,after,options)=>{
  session.started=true;operationBoundary=before.operation?.sequence||0;
  verificationBoundary=null;
  try{const initial={...after,operation:operationStateFromEntries(await session.entries(),{afterSequence:operationBoundary})};return await finishOperation(adapter,before,initial,{...options,verifyPurchase:!actionMode});}
  finally{operationBoundary=null;verificationBoundary=null;}
 },
 choose:async choice=>withSurfaceLock(async()=>{await surfaceReady();if(actionMode&&session.protocolCapture().pending)return {ok:false,reason:'CAPTURE_PENDING'};return session.provider.pressProtocolChoice(session.frame,choice);}),
 advance:async()=>withSurfaceLock(async()=>{
   await surfaceReady();if(actionMode&&session.protocolCapture().pending)return {ok:false,reason:'CAPTURE_PENDING'};const observed=await session.observe();
   if(observed.phase==='choice')return {ok:false,kind:'CHOICE_REQUIRED'};
   return observed.continueAction?session.perform(observed.continueAction):{ok:true,kind:'WAIT'};
 }),
 spinNormal:async current=>withSurfaceLock(async()=>{
   const reject=reason=>({ok:false,clicked:false,retryable:true,reason});
   await surfaceReady();
   const raw=await captureDrawnButtons(controller,session.tabId,artifactDir,{includeUniversal:true,geometryOnly:actionMode});
   const [live,menu]=await independent([()=>measure('runtime.state',()=>session.provider.protocolState(session.frame)),()=>measure('runtime.menu',()=>session.purchaseMenu())]);
   if(live?.canSpin!==true)return reject('NORMAL_SPIN_RUNTIME_NOT_READY');
   if(live.logicIsFreeSpin||live.respinInProgress||live.spinBlockingFeatureIsRunning||live.mustOpenBonus||live.mustOpenAnotherBonus||live.mustResumeFreeSpinOptions)return reject('NORMAL_SPIN_FEATURE_ACTIVE');
   if(live.stopActive||live.lastWinIsCounting||live.waitInResultForBigWin||live.stages?.some(s=>s.name==='StageSpin'))return reject('NORMAL_SPIN_RUNTIME_BUSY');
   if((live.pickerControls||[]).some(c=>c.active===true))return reject('NORMAL_SPIN_CHOICE_ACTIVE');
   if(live.confirmFSActive)return reject('NORMAL_SPIN_CONFIRMATION_ACTIVE');
   if(menu.open)return reject('NORMAL_SPIN_MENU_OPEN');
   const candidates=(raw.controls||[]).filter(b=>b.enabled!==false&&b.handlers?.some(h=>h.event==='Evt_DataToCode_Pressed_Spin'));
   if(!candidates.length)return reject('NORMAL_SPIN_CONTROL_UNAVAILABLE');
   if(candidates.length!==1)return reject('NORMAL_SPIN_CONTROL_AMBIGUOUS');
   const spin=candidates[0],rect=spin.hit_rect;
   if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0)return reject('NORMAL_SPIN_HIT_AREA_UNAVAILABLE');
   const point=chooseHitPoint(spin,raw.controls);
   if(!point)return reject('NORMAL_SPIN_HIT_AREA_AMBIGUOUS');
   const fresh=operationStateFromEntries(await session.entries()),sequenceBefore=fresh.sequence;
   if(sequenceBefore!==current?.operation?.sequence)return reject('NORMAL_SPIN_SEQUENCE_CHANGED');
   if(fresh.protocolSequence!==current?.operation?.protocolSequence)return reject('NORMAL_SPIN_PROTOCOL_CHANGED');
   if(fresh.sequence>0&&fresh.transaction?.complete!==true)return reject('NORMAL_SPIN_RESPONSE_INCOMPLETE');
   if(actionMode&&session.protocolCapture().pending)return reject('NORMAL_SPIN_CAPTURE_PENDING');
   if(fresh.protocolComplete!==true)return reject('NORMAL_SPIN_PROTOCOL_INCOMPLETE');
   if(fresh.cascadeActive)return reject('NORMAL_SPIN_CASCADE_ACTIVE');
   if(!['s','c'].includes(fresh.nextAction))return reject('NORMAL_SPIN_PROTOCOL_NOT_READY');
   if(Date.now()>=deadline)return reject('NORMAL_SPIN_DEADLINE');
   verificationBoundary=sequenceBefore;
   try{
     const clicked=await measure('input.click',()=>controller.withTab(session.tabId).click(point.x,point.y));
     if(clicked?.ok===false)return {ok:false,clicked:true,retryable:false,reason:'NORMAL_SPIN_CLICK_UNCONFIRMED',sequenceBefore,control:spin.path};
     return {ok:true,clicked:true,sequenceBefore,control:spin.path};
   }catch{return {ok:false,clicked:true,retryable:false,reason:'NORMAL_SPIN_CLICK_UNCONFIRMED',sequenceBefore,control:spin.path};}
 }),
 afterAction:async(before,after)=>{
 if(!before.wager||!after.wager)return null;
 const remaining=5000-(Date.now()-lastActionAt);if(remaining>0)await adapter.sleep(remaining);
 after=await adapter.snapshot();const evidence=wagerEvidence(before.wager,after.wager);if(!evidence.needsSpin)return {...evidence,performed:false,observedSnapshot:after};
 if(actionMode){
  if(after.inputReady!==true||after.capture?.pending!==false)return {...evidence,performed:false,reason:'INPUT_NOT_READY',observedSnapshot:after};
  const entryCountBefore=(await session.entries()).length,startedAt=Date.now();
  const attempt=await adapter.spinNormal(after);
  return {...evidence,performed:attempt.clicked===true,kind:'ONE_NORMAL_DEMO_SPIN',control:attempt.control,entryCountBefore,startedAt,attempt,observedSnapshot:attempt.clicked===true?undefined:after};
 }
 return withSurfaceLock(async()=>{await surfaceReady();const live=await session.provider.protocolState(session.frame);const currentMarker=JSON.stringify(controller.withTab(session.tabId).networkEvents());if(currentMarker!==after.wager.serverMarker||live?.canSpin!==true||(await session.purchaseMenu()).open)return {...evidence,performed:false,reason:'STATE_OR_TRAFFIC_CHANGED'};
 const raw=await captureDrawnButtons(controller,session.tabId,artifactDir,{includeUniversal:true,geometryOnly:actionMode});const spin=raw.controls.find(b=>b.center&&b.handlers.some(h=>h.event==='Evt_DataToCode_Pressed_Spin'));if(!spin)return {...evidence,performed:false,reason:'NO_OBSERVED_NORMAL_SPIN'};
 const entryCountBefore=(await session.entries()).length,startedAt=Date.now();await controller.withTab(session.tabId).click(spin.center.x*raw.image_size.width,spin.center.y*raw.image_size.height);return {...evidence,performed:true,kind:'ONE_NORMAL_DEMO_SPIN',control:spin.path,entryCountBefore,startedAt};});
 },
 probeResult:async followup=>{const entries=(await session.entries()).slice(followup.entryCountBefore);const entry=entries.find(e=>new URLSearchParams(e.request?.postData?.text||'').get('action')==='doSpin');if(!entry||entry._fuzzerPending===true||entry.response?._error||entry.response?.status!==200)return {classification:'UNKNOWN',reason:'NO_COMPLETED_SPIN_RESPONSE'};const content=entry.response.content;const response=new URLSearchParams(content.encoding==='base64'?Buffer.from(content.text,'base64').toString():content.text);const request=new URLSearchParams(entry.request.postData.text);const read=k=>parseProtocolMoney(response.get(k));const c=Number(request.get('c')),l=Number(request.get('l'));const cost=classifySpinDebit({balanceBefore:followup.balanceAfter,balance:response.get('balance'),nextAction:response.get('na'),baseCost:c*l});return {...cost,request:{action:'doSpin',bl:request.get('bl'),c:request.get('c'),l:request.get('l')},responseBalance:read('balance'),responseWin:read('w'),nextAction:response.get('na'),status:entry.response.status};}

 };
 for(const [method,label] of Object.entries({snapshot:'adapter.snapshot',reset:'adapter.reset',click:'adapter.click',clickCenter:'adapter.continue',choose:'adapter.choose',advance:'adapter.advance',spinNormal:'adapter.probe',afterAction:'adapter.after-action',finishOperation:'adapter.finish',sleep:'wait.poll'})){const original=adapter[method];adapter[method]=(...args)=>measure(label,()=>original(...args));}
 let result,runError;
 try{return result=await exploreStates(adapter,{maxActions,maxDepth,deadline,onProgress,mode,wait:(a,b)=>measure('wait.transition',()=>waitTransition(a,b,{mode,deadline,...(actionMode?{quietMs:2000,activeMs:15000}: {})}))});}
 catch(error){runError=error;throw error;}
 finally{
  try{await close();if(result){result.retainedTabIds=[];result.cleanupPending=false;if(actionMode)result.branchCaptures=branchCaptures;}}
  catch(error){
   if(result){result.status='PARTIAL';result.cleanupError=error.cleanupError;result.retainedTabIds=error.retainedTabIds;result.cleanupPending=true;result.pending.push({phase:'cleanup',reason:'SESSION_CLEANUP_FAILED',retainedTabIds:error.retainedTabIds,error:error.cleanupError});}
   else if(runError){runError.cleanupError=error.cleanupError;runError.retainedTabIds=error.retainedTabIds;}
   else throw error;
  }
  // Consolidate only saved own HARs; a retained tab keeps its unsaved evidence.
  try{const combinedPath=await measure('har.consolidate',()=>consolidateHars(savedHars,artifactDir));await fs.writeFile(path.join(artifactDir,'har-reference.json'),JSON.stringify({path:combinedPath}));}
  catch(error){
   if(runError)runError.artifactError=String(error.message);
   else if(result){result.status='PARTIAL';result.artifactError=String(error.message);result.pending.push({phase:'artifact',reason:'HAR_CONSOLIDATION_FAILED',error:String(error.message)});}
   else throw error;
  }
 }
}

/** Opt-in diagnostics, run-local concurrency; no telemetry contains game data. */
export async function runStateExplorer(controller,options={}){
 const {benchmark=false,performanceMode='parallel',...runOptions}=options;
 const recorder=benchmark?createBenchmark():null;
 return withBenchmark(recorder,async()=>{
  let result,timer;
  if(recorder){timer=setInterval(()=>{
   const report=recorder.report({includeTrace:false});
   console.log('FUZZER_BENCHMARK_PROGRESS='+JSON.stringify({mode:performanceMode,elapsedMs:report.elapsedMs,active:report.active,top:report.stages.slice(0,6)}));
  },15000);timer.unref?.();}
  try{
   result=await measure('exploration.total',()=>runStateExplorerImpl(controller,{...runOptions,onProgress:progress=>measure('checkpoint.progress',()=>runOptions.onProgress?.({...progress,...(recorder?{performance:{...recorder.report({includeTrace:false}),mode:performanceMode}}:{})}))}));
   return result;
  }finally{
   clearInterval(timer);
   if(recorder){
    const report={...recorder.report(),mode:performanceMode};
    const {trace,...summary}=report;if(result)result.performance=summary;
    try{
     await fs.mkdir(runOptions.artifactDir,{recursive:true});
     const filename=path.join(runOptions.artifactDir,'performance.json');
     await fs.writeFile(filename+'.tmp',JSON.stringify(report));await fs.rename(filename+'.tmp',filename);
     console.log('FUZZER_BENCHMARK_JSON='+JSON.stringify(summary));
    }catch{if(result)result.performanceWriteFailed=true;console.log('FUZZER_BENCHMARK_WRITE_FAILED');}
   }
  }
 },{mode:performanceMode});
}
