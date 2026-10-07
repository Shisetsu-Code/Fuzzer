import assert from 'node:assert/strict';
import {mock} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';

const scenario=process.argv[2],wallStart=performance.now();
const artifactDir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-integration-'));
let clock=1000000,creates=0,closes=0,phase='root',normalSpins=0,centerClicks=0,raced=false,freshGuardArmed=false;
const owned=new Set(),clicks=[],entries=[];let stateReads=0;
const rect=(x)=>({x,y:10,width:20,height:20});
const button=(name,x,event)=>({root:0,path:`Game/${name}`,name,labels:[],sprite_names:[name],handlers:[{kind:'XTButton',index:x,event}],drawn_rect:rect(x),hit_rect:rect(x),enabled:true,clickable:'RUNTIME_COLLIDER'});
const spin=button('StartSpin_Button',70,'Evt_DataToCode_Pressed_Spin');
const alpha=button('FeatureAlpha',10,'Evt_FeatureAlpha');
const beta=button('FeatureBeta',35,'Evt_FeatureBeta');
const gamma=button('FeatureGamma',10,'Evt_FeatureGamma');
gamma.hit_rect={x:10,y:40,width:20,height:20};gamma.drawn_rect={...gamma.hit_rect};
const isReset=scenario==='reset-failure'||scenario==='reset-recovered';
const protocolRaces=new Map([['verification-nonspin-race','NORMAL_SPIN_PROTOCOL_CHANGED'],['verification-response-race','NORMAL_SPIN_PROTOCOL_NOT_READY'],['verification-cascade-race','NORMAL_SPIN_CASCADE_ACTIVE'],['verification-body-pending','NORMAL_SPIN_RESPONSE_INCOMPLETE']]);
const isAction=scenario.startsWith('action-');
const isPurchase=['action-stale-flags','action-late-continuation','action-generic-choice','action-capture','delayed-purchase','normal-flags-overlay','verification-no-request','verification-click-error','verification-race'].includes(scenario)||protocolRaces.has(scenario);
const continuation={...button('FullScreenContinue',0,'Evt_Continue'),labels:['PRESS ANYWHERE TO CONTINUE'],hit_rect:{x:0,y:0,width:100,height:100},drawn_rect:{x:0,y:0,width:100,height:100}};
const accept={...button('ButtonYes0',35,'Evt_Confirm'),path:'Game/FeaturePurchase/FSPurchaseOptions/ConfirmationWindow/content/Buttons/ButtonYes0'};
const raw=()=>({supported:true,viewport:{width:100,height:100},controls:scenario==='action-v2-menu'&&phase==='done'?[accept]:scenario==='action-generic-choice'&&phase==='choice'?[button('UnlabelledLeft',10,'Evt_A'),button('UnlabelledRight',35,'Evt_B')]:[...(phase==='overlay'?[continuation]:[spin]),...(scenario==='hitless'?[{...alpha,hit_rect:null,clickable:'UNKNOWN'}]:isReset?(phase==='root'?[alpha,beta,gamma]:[]):isPurchase||isAction?[alpha]:[])],unresolved:[]});
const exchange=(extra='')=>({request:{url:'https://demogamesfree.pragmaticplay.net/gs2c/gameService?token=private',postData:{text:`action=doSpin&c=0.1&l=20&${extra}`}},response:{status:200,content:{text:'na=s&balance=100000'}}});
const controller={tabs:{activate:async id=>{assert.equal(id,42);}},withTab:id=>{
 assert.equal(id,42);
 return {networkEvents:()=>entries.map((_,i)=>({sequence:i+1})),click:async(x,y)=>{
  if(scenario==='action-late-continuation'&&phase==='overlay'){clicks.push('continue');phase='done';return {ok:true};}
  if(scenario==='action-generic-choice'&&phase==='choice'){clicks.push('decision');entries.push({request:{url:'https://demogamesfree.pragmaticplay.net/gs2c/gameService',postData:{text:'action=doBonus&ind=0'}},response:{status:200,content:{text:'na=s&balance=99900'}}});phase='done';return {ok:true};}
  if(x>=70){normalSpins++;clicks.push('spin');if(scenario==='verification-click-error')throw Error('click transport uncertain');if(scenario!=='verification-no-request')entries.push(exchange());}
  else{clicks.push('alpha');if(isPurchase){entries.push(exchange('pur=2&mgckey=private'));if(scenario==='delayed-purchase')entries.push(exchange());if(scenario==='normal-flags-overlay'||scenario==='action-late-continuation')phase='overlay';if(scenario==='action-generic-choice'){phase='choice';entries.at(-1).response.content.text='na=b&balance=99900';}}else phase='done';}
 }};
}};

// Browser/session creation, raster capture, and paint checks are external boundaries.
// Traversal, state parsing, operation completion, filtering, and HAR saving stay real.
// namedExports works in both Node 22 and 24; the newer exports option is unavailable in Node 22.
mock.module(new URL('../../integrations/hardfire/session.js',import.meta.url).href,{namedExports:{createHardFireSession:async(_controller,options)=>{
 creates++;assert.equal(creates,1,'cleanup failure must never authorize another session');
 const session={tabId:42,provider:{protocolState:async()=>{if(scenario==='action-snapshot-race'&&++stateReads===2)entries.push(exchange());return {canSpin:!(scenario==='action-v2-menu'&&phase==='done')&&!(scenario==='action-stale-flags'&&entries.length),stages:scenario==='action-late-continuation'&&phase==='overlay'?['StageSpin'].map(name=>({name})):[],pickerControls:[],logicIsFreeSpin:scenario==='action-stale-flags'&&entries.length>0,respinInProgress:false,spinBlockingFeatureIsRunning:false,stopActive:false,lastWinIsCounting:false,waitInResultForBigWin:false};}},
 frame:{evaluate:async fn=>{
  if(fn.name==='inspectDrawnButtons'){if(scenario==='observation-failure')throw Error('runtime observation failed');return raw();}
  assert.equal(fn.name,'readRuntimeBalance');return {balance:100000,balanceSource:'runtime:BalanceDisplayed.GetDouble',candidates:[],...(scenario==='action-wager-race'?{betAmount:raced?3:2,betSource:'runtime:TotalBetDisplayed.GetDouble'}:{})};
 }},protocolCapture:()=>({entries,marker:JSON.stringify(entries),pending:false,uncertain:scenario==='action-uncertain-capture'&&raced}),entries:async()=>{
  if(freshGuardArmed&&!raced){
   raced=true;
   if(scenario==='verification-nonspin-race')entries.push({request:{url:'https://demogamesfree.pragmaticplay.net/gs2c/gameService',postData:{text:'action=doCollect'}},response:{status:0,content:{text:''}}});
   else entries.at(-1).response.content.text=scenario==='verification-response-race'?'na=b':scenario==='verification-cascade-race'?'na=s&rs_c=1':'';
  }
  return entries;
 },purchaseMenu:async()=>({open:false}),clickContinue:async()=>{if(isPurchase){centerClicks++;clicks.push('continue');}if(scenario==='normal-flags-overlay')phase='done';return {ok:true};},observe:async()=>({phase:'base'}),close:async()=>{
  closes++;
  if(scenario==='reset-failure'||scenario==='final-failure'||scenario==='observation-failure'||scenario==='reset-recovered'&&closes===1)throw Error('HAR write failed');
  const harPath=path.join(artifactDir,'owned-session.har');await fs.writeFile(harPath,JSON.stringify({log:{version:'1.2',entries}}));session.har={path:harPath};options.onClosedTab?.(42);
 }};
 options.onOwnedTab?.(42,()=>session.close());return session;
}}});
mock.module(new URL('../../integrations/hardfire/drawn-buttons.js',import.meta.url).href,{namedExports:{captureDrawnButtons:async(_controller,_id,_dir,options)=>{
 if((scenario==='action-uncertain-capture'||scenario==='action-wager-race')&&options?.includeUniversal)raced=true;
 if(scenario==='verification-race'&&options?.includeUniversal&&entries.length&&!raced){raced=true;entries.push(exchange());}
 if(protocolRaces.has(scenario)&&options?.includeUniversal&&entries.length&&!raced)freshGuardArmed=true;
 return {capture_id:'capture-1',full_path:path.join(artifactDir,'screen.jpg'),artifact_dir:artifactDir,image_size:{width:100,height:100},controls:raw().controls.map(b=>({...b,...(scenario==='action-disabled-control'&&options?.includeUniversal?{enabled:false}:{}),center:b.hit_rect?{x:(b.hit_rect.x+b.hit_rect.width/2)/100,y:(b.hit_rect.y+b.hit_rect.height/2)/100}:null}))};
}}});
mock.module(new URL('../../integrations/hardfire/paint-guard.js',import.meta.url).href,{namedExports:{withSurfaceLock:async fn=>fn(),ensurePainted:async()=>({ok:true})}});
const {runStateExplorer}=await import('../../integrations/hardfire/state-explorer.js');

// Advance only this child process's scheduling clock; no game or wall-clock waits.
mock.method(Date,'now',()=>clock);
mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{clock+=ms;queueMicrotask(()=>fn(...args));return 1;});
try{
 if(scenario==='action-probe')entries.push({request:{url:'https://demogamesfree.pragmaticplay.net/gs2c/gameService',postData:{text:'action=doInit'}},response:{status:200,content:{text:'na=s&balance=100000'}}});
 const options={benchmark:process.env.PERF_TEST==='1',performanceMode:process.env.PERF_MODE||'parallel',mode:isAction?'actions':'strict',maxRetries:0,gameUrl:'https://www.pragmaticplay.fun/en/slots/example/',artifactDir,maxActions:['action-generic-choice','action-v2-menu'].includes(scenario)?1:5,timeoutMs:60000,onOwnedTab:id=>owned.add(id),onClosedTab:id=>owned.delete(id)};
 if(scenario==='observation-failure'){
  await assert.rejects(runStateExplorer(controller,options),error=>{
   assert.equal(error.message,'runtime observation failed');assert.equal(error.cleanupError,'HAR write failed');assert.deepEqual(error.retainedTabIds,[42]);return true;
  });
  assert.equal(creates,1);assert.equal(closes,1);assert.deepEqual([...owned],[42]);assert.deepEqual(clicks,[]);
 }else{
  const result=await runStateExplorer(controller,options);
  assert.equal(creates,1);assert.equal(result.completeGame,false);if(process.env.PERF_TEST==='1'){assert(result.performance.stages.some(s=>s.name==='adapter.snapshot'));const perf=JSON.parse(await fs.readFile(path.join(artifactDir,'performance.json'),'utf8'));assert.equal(perf.active.length,0);assert.equal(perf.mode,process.env.PERF_MODE);assert(perf.trace.length>0);}
  if(scenario==='action-v2-menu'){assert.equal(result.nodes.length,2);assert.equal(result.edges[0].reason,'STATE_CHANGED');assert.equal(result.nodes[1].wager.menuOpen,true);assert(result.pending.some(p=>p.action===accept.path));assert.deepEqual(clicks,['alpha']);}
  else if(scenario==='action-wager-race'){assert.equal(result.actions,0);assert.deepEqual(clicks,[]);assert(result.pending.some(p=>p.error==='ACTION_CONFIGURATION_CHANGED'));}
  else if(scenario==='action-snapshot-race'){assert.equal(result.actions,0);assert.deepEqual(clicks,[]);assert(result.pending.some(p=>p.error==='ACTION_PROTOCOL_CHANGED'));}
  else if(scenario==='action-generic-choice'){assert.deepEqual(clicks,['alpha','decision','spin']);assert.equal(result.edges[0].operation.decisions[0].options.length,2);assert(result.pending.some(p=>p.choicePlan?.length===1));assert.equal(result.edges[0].operation.ok,true);}
  else if(scenario==='action-disabled-control'||scenario==='action-uncertain-capture'){assert.equal(result.actions,0);assert.deepEqual(clicks,[]);assert.equal(result.pending.length,1);}
  else if(scenario==='action-stale-flags'||scenario==='action-late-continuation'){const operation=result.edges[0].operation;assert.equal(operation.ok,true);assert.equal(operation.normalSpinVerified,true);assert.equal(operation.closureEvidence.basis,'OBSERVED_NORMAL_SPIN');assert.equal(normalSpins,1);assert.deepEqual(clicks,scenario==='action-late-continuation'?['alpha','continue','spin']:['alpha','spin']);}
  else if(isAction){
   assert.equal(result.status,'EXHAUSTED_OBSERVED_CONTROLS');assert.equal(result.edges.length,1);assert.equal(result.nodes.length,1);assert.equal(result.edges[0].validity.valid,true);
   assert.equal(result.edges[0].operation.ok,true);assert.equal(result.edges[0].operation.verificationRequired,scenario==='action-capture');
   assert.equal(normalSpins,1);assert.equal(result.edges[0].operation.normalSpinVerified,true);
  }else if(scenario==='delayed-purchase'||scenario==='normal-flags-overlay'||scenario==='verification-race'){
   assert.equal(result.status,'EXHAUSTED_OBSERVED_CONTROLS');assert.equal(result.edges.length,1);assert.equal(result.nodes.length,1);
   const operation=result.edges[0].operation;
   assert.equal(operation.kind,'purchase');assert.equal(operation.ok,true);assert.equal(operation.submission.payload.pur,'2');assert.equal(operation.submission.sequence,1);
   assert.equal(operation.normalSpinVerified,true);assert.equal(operation.verificationRequired,true);assert.equal(operation.verification.kind,'spin');assert.equal(operation.verification.payload.pur,undefined);
   assert.equal(normalSpins,1);assert.deepEqual(clicks,scenario==='normal-flags-overlay'?['alpha','continue','spin']:['alpha','spin']);
   assert.equal(centerClicks,scenario==='normal-flags-overlay'?1:0);
   assert.equal(entries.length,scenario==='normal-flags-overlay'?2:3);assert(!JSON.stringify(result).includes('private'));
   if(scenario==='verification-race'){assert.equal(operation.verification.sequence,3);assert.equal(raced,true);}
  }else if(protocolRaces.has(scenario)){
   assert.equal(result.status,'PARTIAL');assert.equal(result.edges.length,1);const operation=result.edges[0].operation;
   assert.equal(operation.reason,'OPERATION_TIMEOUT');assert.equal(operation.normalSpinVerified,false);assert.equal(operation.verification,null);
   assert.equal(operation.completion.lastSpinAttempt.reason,protocolRaces.get(scenario));assert.equal(operation.completion.lastSpinAttempt.clicked,false);
   assert.equal(normalSpins,0);assert.equal(raced,true);assert.equal(entries.filter(e=>new URLSearchParams(e.request.postData.text).get('action')==='doSpin').length,1);
   assert(!JSON.stringify(result).includes('private'));
  }else if(scenario==='verification-no-request'||scenario==='verification-click-error'){
   assert.equal(result.status,'PARTIAL');assert.equal(result.edges.length,1);const operation=result.edges[0].operation;
   assert.equal(operation.normalSpinVerified,false);assert.equal(operation.verification,null);
   if(scenario==='verification-no-request'){assert.equal(operation.reason,'OPERATION_TIMEOUT');assert.equal(operation.completion.phase,'verification_request');assert(operation.completion.blockers.includes('VERIFICATION_REQUEST_NOT_OBSERVED'));}
   else{assert.equal(operation.completion.lastSpinAttempt.clicked,true);assert.equal(operation.completion.lastSpinAttempt.retryable,false);assert.equal(operation.completion.lastSpinAttempt.reason,'NORMAL_SPIN_CLICK_UNCONFIRMED');}
   assert.equal(operation.completion.flags.canSpin,true);
   assert.equal(operation.completion.boundaries.verificationAfterSequence,scenario==='verification-no-request'?1:null);
   if(scenario==='verification-click-error')assert.equal(operation.completion.lastSpinAttempt.sequenceBefore,1);
   assert.equal(normalSpins,1);assert.equal(centerClicks,0);assert.deepEqual(clicks,['alpha','spin']);assert.equal(entries.length,1);
   assert(!JSON.stringify(result).includes('private'));
  }else if(scenario==='hitless'){
   assert.equal(result.status,'PARTIAL');assert.equal(result.actions,0);assert.deepEqual(clicks,[]);
   assert.equal(result.pending[0].reason,'UNRESOLVED_HIT_AREA');assert.equal(result.pending[0].action,'Game/FeatureAlpha');assert.equal(result.pending[0].evidence.full_path,path.join(artifactDir,'screen.jpg'));
  }else if(isReset){
   assert.equal(result.status,'PARTIAL');assert.equal(result.edges.length,1);assert.equal(result.edges[0].action,'Game/FeatureAlpha');assert.equal(result.nodes.length,2);assert.deepEqual(clicks,['alpha']);assert.equal(closes,2);
   assert.deepEqual(result.pending.filter(p=>p.action).map(p=>[p.action,p.reason]),[['Game/FeatureBeta','SESSION_CLEANUP_FAILED'],['Game/FeatureGamma','SESSION_CLEANUP_FAILED']]);
   assert.equal(result.cleanupError,'HAR write failed');assert.deepEqual(result.retainedTabIds,scenario==='reset-recovered'?[]:[42]);
  }else if(scenario==='final-failure'){
   assert.equal(result.status,'PARTIAL');assert.equal(result.nodes.length,1);assert.equal(result.edges.length,0);assert.deepEqual(clicks,[]);assert.equal(closes,1);
   assert.equal(result.pending[0].phase,'cleanup');assert.equal(result.pending[0].reason,'SESSION_CLEANUP_FAILED');assert.equal(result.cleanupError,'HAR write failed');assert.deepEqual(result.retainedTabIds,[42]);
  }else throw Error('Unknown scenario');
  const retained=scenario==='reset-failure'||scenario==='final-failure';assert.deepEqual([...owned],retained?[42]:[]);
  const reference=JSON.parse(await fs.readFile(path.join(artifactDir,'har-reference.json'),'utf8'));
  if(retained)assert.equal(reference.path,null);
  else{assert.equal(reference.path,path.join(await fs.realpath(artifactDir),'all-branches.har'));const saved=JSON.parse(await fs.readFile(reference.path,'utf8'));assert.equal(saved.log.entries.length,entries.length);}
 }
 console.log(JSON.stringify({scenario,creates,closes,normalSpins,centerClicks,wallMs:performance.now()-wallStart}));
}finally{mock.restoreAll();await fs.rm(artifactDir,{recursive:true,force:true});}
