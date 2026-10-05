import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {createHardFireSession} from './session.js';import {captureDrawnButtons} from './drawn-buttons.js';import {inspectDrawnButtons} from '../../providers/pragmatic/drawn-buttons.js';import {filterKnownControls} from '../../providers/pragmatic/known-controls.js';import {exploreStates} from '../../providers/pragmatic/state-explorer.js';
import {consolidateHars} from './har-consolidation.js';
import {chooseHitPoint} from '../../providers/pragmatic/hit-point.js';
import {withSurfaceLock,ensurePainted} from './paint-guard.js';
import {wagerEvidence,readRuntimeBalance,baseSurfaceMatches,parseProtocolMoney,classifySpinDebit} from '../../providers/pragmatic/wager-evidence.js';
import {operationStateFromEntries,finishOperation,visibleOperationChoices} from '../../providers/pragmatic/operation-completion.js';
export async function runStateExplorer(controller,{gameUrl,artifactDir,maxActions=20,maxDepth=4,timeoutMs=600000,onProgress}={}){
 let session,lastEvidence,lastKey,lastCapture=0,rootSurface=null,rootConfiguration=null,lastActionAt=0;const savedHars=[];
 const close=async()=>{if(!session)return;const owned=session;session=null;await owned.close();if(owned.har?.path)savedHars.push(owned.har.path);};
 const adapter={now:()=>Date.now(),sleep:ms=>new Promise(r=>setTimeout(r,ms)),reset:async()=>{await close();session=await createHardFireSession(controller,{gameUrl,artifactDir,entryOnly:true});lastKey=null;rootSurface=null;rootConfiguration=null;await controller.tabs.activate(session.tabId);},
 snapshot:async()=>withSurfaceLock(async()=>{await ensurePainted(controller,session.tabId);const raw=await session.frame.evaluate(inspectDrawnButtons);const controls=filterKnownControls(raw.controls||[]).keep.filter(b=>b.hit_rect).map(b=>({...b,key:b.path}));const state=await session.provider.protocolState(session.frame);const flags={stages:state?.stages?.map(s=>s.name).sort(),logicIsFreeSpin:state?.logicIsFreeSpin,respinInProgress:state?.respinInProgress,spinBlockingFeatureIsRunning:state?.spinBlockingFeatureIsRunning,canSpin:state?.canSpin,stopActive:state?.stopActive,lastWinIsCounting:state?.lastWinIsCounting,waitInResultForBigWin:state?.waitInResultForBigWin};
 const wallet=await session.frame.evaluate(readRuntimeBalance);const entries=await session.entries();
 if(wallet.balance===null||wallet.balance===0){for(const entry of [...entries].reverse()){const content=entry.response?.content;if(!content?.text||content.encoding==='base64')continue;const fields=new URLSearchParams(content.text);const value=fields.get('balance');if(value!==null&&value.trim()!==''&&parseProtocolMoney(value)!==null){wallet.balance=parseProtocolMoney(value);wallet.balanceSource='server:balance';break;}}}
 const menu=await session.purchaseMenu();const wager={...wallet,betLevelIndex:state?.betLevelIndex??null,canSpin:state?.canSpin===true,menuOpen:menu.open===true,serverMarker:JSON.stringify(controller.withTab(session.tabId).networkEvents())};
 const surface=controls.map(b=>({center:{x:(b.hit_rect.x+b.hit_rect.width/2)/raw.viewport.width,y:(b.hit_rect.y+b.hit_rect.height/2)/raw.viewport.height}}));
 const configuration=JSON.stringify({buttons:controls.map(b=>({path:b.key,labels:b.labels||[],sprites:b.sprite_names})),betLevelIndex:wager.betLevelIndex});
 if(rootSurface===null){rootSurface=surface;rootConfiguration=configuration;}
 wager.probeReady=configuration!==rootConfiguration&&baseSurfaceMatches(rootSurface,surface)&&!wager.menuOpen&&!state?.logicIsFreeSpin&&!state?.respinInProgress&&!state?.spinBlockingFeatureIsRunning;
 const key=createHash('sha256').update(JSON.stringify({configuration,flags})).digest('hex').slice(0,20);
 if(key!==lastKey||Date.now()-lastCapture>10000){lastEvidence=await captureDrawnButtons(controller,session.tabId,artifactDir);lastKey=key;lastCapture=Date.now();}
 // Every captured HTTP exchange is activity; no provider endpoint/action labels select clicks.
 const network=controller.withTab(session.tabId).networkEvents();
 const traffic=JSON.stringify(network);
 const choices=visibleOperationChoices(state?.pickerControls,raw.controls);
 return {key,controls,choices,operation:operationStateFromEntries(entries),unresolved:filterKnownControls(raw.unresolved||[]).keep,traffic,wager,evidence:{tab_id:session.tabId,capture_id:lastEvidence.capture_id,full_path:lastEvidence.full_path,artifact_dir:lastEvidence.artifact_dir},flags};}),
 click:async b=>withSurfaceLock(async()=>{await ensurePainted(controller,session.tabId);const fresh=await captureDrawnButtons(controller,session.tabId,artifactDir,{includeUniversal:true});const target=fresh.controls.find(c=>c.path===b.key);if(!target?.center)throw Error('Observed control is no longer available');const point=chooseHitPoint(target,fresh.controls);if(!point)throw Error('AMBIGUOUS_HIT_AREA');lastActionAt=Date.now();await controller.withTab(session.tabId).click(point.x,point.y);}),
 clickCenter:async()=>withSurfaceLock(async()=>{await ensurePainted(controller,session.tabId);return session.clickContinue();}),
 operationStarted:(before,after)=>(after.operation?.sequence||0)>(before.operation?.sequence||0),
 finishOperation:async(before,after,options)=>{session.started=true;return finishOperation(adapter,before,after,options);},
 choose:async choice=>withSurfaceLock(async()=>{await ensurePainted(controller,session.tabId);return session.provider.pressProtocolChoice(session.frame,choice);}),
 advance:async()=>withSurfaceLock(async()=>{
   await ensurePainted(controller,session.tabId);const observed=await session.observe();
   if(observed.phase==='choice')return {ok:false,kind:'CHOICE_REQUIRED'};
   return observed.continueAction?session.perform(observed.continueAction):{ok:true,kind:'WAIT'};
 }),
 spinNormal:async()=>withSurfaceLock(async()=>{
   await ensurePainted(controller,session.tabId);const live=await session.provider.protocolState(session.frame);
   if(live?.canSpin!==true||live.logicIsFreeSpin||live.respinInProgress||live.spinBlockingFeatureIsRunning||(await session.purchaseMenu()).open)return {ok:false};
   const raw=await captureDrawnButtons(controller,session.tabId,artifactDir,{includeUniversal:true});
   const spin=raw.controls.find(b=>b.center&&b.handlers.some(h=>h.event==='Evt_DataToCode_Pressed_Spin'));
   if(!spin)return {ok:false};
   await controller.withTab(session.tabId).click(spin.center.x*raw.image_size.width,spin.center.y*raw.image_size.height);return {ok:true};
 }),
 afterAction:async(before,after)=>{
 if(!before.wager||!after.wager)return null;
 const remaining=5000-(Date.now()-lastActionAt);if(remaining>0)await adapter.sleep(remaining);
 after=await adapter.snapshot();const evidence=wagerEvidence(before.wager,after.wager);if(!evidence.needsSpin)return {...evidence,performed:false,observedSnapshot:after};
 return withSurfaceLock(async()=>{await ensurePainted(controller,session.tabId);const live=await session.provider.protocolState(session.frame);const currentMarker=JSON.stringify(controller.withTab(session.tabId).networkEvents());if(currentMarker!==after.wager.serverMarker||live?.canSpin!==true||(await session.purchaseMenu()).open)return {...evidence,performed:false,reason:'STATE_OR_TRAFFIC_CHANGED'};
 const raw=await captureDrawnButtons(controller,session.tabId,artifactDir,{includeUniversal:true});const spin=raw.controls.find(b=>b.center&&b.handlers.some(h=>h.event==='Evt_DataToCode_Pressed_Spin'));if(!spin)return {...evidence,performed:false,reason:'NO_OBSERVED_NORMAL_SPIN'};
 const entryCountBefore=(await session.entries()).length,startedAt=Date.now();await controller.withTab(session.tabId).click(spin.center.x*raw.image_size.width,spin.center.y*raw.image_size.height);return {...evidence,performed:true,kind:'ONE_NORMAL_DEMO_SPIN',control:spin.path,entryCountBefore,startedAt};});
 },
 probeResult:async followup=>{const entries=(await session.entries()).slice(followup.entryCountBefore);const entry=entries.find(e=>new URLSearchParams(e.request?.postData?.text||'').get('action')==='doSpin');if(!entry||entry.response?.status!==200)return {classification:'UNKNOWN',reason:'NO_COMPLETED_SPIN_RESPONSE'};const content=entry.response.content;const response=new URLSearchParams(content.encoding==='base64'?Buffer.from(content.text,'base64').toString():content.text);const request=new URLSearchParams(entry.request.postData.text);const read=k=>parseProtocolMoney(response.get(k));const c=Number(request.get('c')),l=Number(request.get('l'));const cost=classifySpinDebit({balanceBefore:followup.balanceAfter,balance:response.get('balance'),nextAction:response.get('na'),baseCost:c*l});return {...cost,request:{action:'doSpin',bl:request.get('bl'),c:request.get('c'),l:request.get('l')},responseBalance:read('balance'),responseWin:read('w'),nextAction:response.get('na'),status:entry.response.status};}

 };
 try{return await exploreStates(adapter,{maxActions,maxDepth,deadline:Date.now()+timeoutMs,onProgress});}finally{await close();
 // Keep the latest automatic branch HAR only. All screenshots/graph evidence remain.
 const combinedPath=await consolidateHars(savedHars,artifactDir);
 await fs.writeFile(path.join(artifactDir,'har-reference.json'),JSON.stringify({path:combinedPath}));}
}
