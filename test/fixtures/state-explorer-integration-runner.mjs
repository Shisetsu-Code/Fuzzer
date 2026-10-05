import assert from 'node:assert/strict';
import {mock} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';

const scenario=process.argv[2],wallStart=performance.now();
const artifactDir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-integration-'));
let clock=1000000,creates=0,closes=0,phase='root',normalSpins=0;
const owned=new Set(),clicks=[],entries=[];
const rect=(x)=>({x,y:10,width:20,height:20});
const button=(name,x,event)=>({root:0,path:`Game/${name}`,name,labels:[],sprite_names:[name],handlers:[{kind:'XTButton',index:x,event}],drawn_rect:rect(x),hit_rect:rect(x),enabled:true,clickable:'RUNTIME_COLLIDER'});
const spin=button('StartSpin_Button',70,'Evt_DataToCode_Pressed_Spin');
const alpha=button('FeatureAlpha',10,'Evt_FeatureAlpha');
const beta=button('FeatureBeta',35,'Evt_FeatureBeta');
const gamma=button('FeatureGamma',10,'Evt_FeatureGamma');
gamma.hit_rect={x:10,y:40,width:20,height:20};gamma.drawn_rect={...gamma.hit_rect};
const isReset=scenario==='reset-failure'||scenario==='reset-recovered';
const raw=()=>({supported:true,viewport:{width:100,height:100},controls:[spin,...(scenario==='hitless'?[{...alpha,hit_rect:null,clickable:'UNKNOWN'}]:isReset?(phase==='root'?[alpha,beta,gamma]:[]):scenario==='delayed-purchase'?[alpha]:[])],unresolved:[]});
const exchange=(extra='')=>({request:{url:'https://demogamesfree.pragmaticplay.net/gs2c/gameService?token=private',postData:{text:`action=doSpin&c=0.1&l=20&${extra}`}},response:{status:200,content:{text:'na=s&balance=100000'}}});
const controller={tabs:{activate:async id=>{assert.equal(id,42);}},withTab:id=>{
 assert.equal(id,42);
 return {networkEvents:()=>entries.map((_,i)=>({sequence:i+1})),click:async(x,y)=>{
  if(x>=70){normalSpins++;clicks.push('spin');entries.push(exchange());}
  else{clicks.push('alpha');if(scenario==='delayed-purchase')entries.push(exchange('pur=2&mgckey=private'),exchange());else phase='done';}
 }};
}};

// Browser/session creation, raster capture, and paint checks are external boundaries.
// Traversal, state parsing, operation completion, filtering, and HAR saving stay real.
mock.module(new URL('../../integrations/hardfire/session.js',import.meta.url).href,{exports:{createHardFireSession:async(_controller,options)=>{
 creates++;assert.equal(creates,1,'cleanup failure must never authorize another session');
 const session={tabId:42,provider:{protocolState:async()=>({canSpin:true,stages:[],pickerControls:[]})},
 frame:{evaluate:async fn=>{
  if(fn.name==='inspectDrawnButtons'){if(scenario==='observation-failure')throw Error('runtime observation failed');return raw();}
  assert.equal(fn.name,'readRuntimeBalance');return {balance:100000,balanceSource:'runtime:BalanceDisplayed.GetDouble',candidates:[]};
 }},entries:async()=>entries,purchaseMenu:async()=>({open:false}),clickContinue:async()=>({ok:true}),observe:async()=>({phase:'base'}),close:async()=>{
  closes++;
  if(scenario==='reset-failure'||scenario==='final-failure'||scenario==='observation-failure'||scenario==='reset-recovered'&&closes===1)throw Error('HAR write failed');
  const harPath=path.join(artifactDir,'owned-session.har');await fs.writeFile(harPath,JSON.stringify({log:{version:'1.2',entries}}));session.har={path:harPath};options.onClosedTab?.(42);
 }};
 options.onOwnedTab?.(42,()=>session.close());return session;
}}});
mock.module(new URL('../../integrations/hardfire/drawn-buttons.js',import.meta.url).href,{exports:{captureDrawnButtons:async()=>({capture_id:'capture-1',full_path:path.join(artifactDir,'screen.jpg'),artifact_dir:artifactDir,image_size:{width:100,height:100},controls:raw().controls.map(b=>({...b,center:b.hit_rect?{x:(b.hit_rect.x+b.hit_rect.width/2)/100,y:(b.hit_rect.y+b.hit_rect.height/2)/100}:null}))})}});
mock.module(new URL('../../integrations/hardfire/paint-guard.js',import.meta.url).href,{exports:{withSurfaceLock:async fn=>fn(),ensurePainted:async()=>({ok:true})}});
const {runStateExplorer}=await import('../../integrations/hardfire/state-explorer.js');

// Advance only this child process's scheduling clock; no game or wall-clock waits.
mock.method(Date,'now',()=>clock);
mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{clock+=ms;queueMicrotask(()=>fn(...args));return 1;});
try{
 const options={gameUrl:'https://www.pragmaticplay.fun/en/slots/example/',artifactDir,maxActions:5,timeoutMs:60000,onOwnedTab:id=>owned.add(id),onClosedTab:id=>owned.delete(id)};
 if(scenario==='observation-failure'){
  await assert.rejects(runStateExplorer(controller,options),error=>{
   assert.equal(error.message,'runtime observation failed');assert.equal(error.cleanupError,'HAR write failed');assert.deepEqual(error.retainedTabIds,[42]);return true;
  });
  assert.equal(creates,1);assert.equal(closes,1);assert.deepEqual([...owned],[42]);assert.deepEqual(clicks,[]);
 }else{
  const result=await runStateExplorer(controller,options);
  assert.equal(creates,1);assert.equal(result.completeGame,false);
  if(scenario==='delayed-purchase'){
   assert.equal(result.status,'EXHAUSTED_OBSERVED_CONTROLS');assert.equal(result.edges.length,1);assert.equal(result.nodes.length,1);
   const operation=result.edges[0].operation;
   assert.equal(operation.kind,'purchase');assert.equal(operation.ok,true);assert.equal(operation.submission.payload.pur,'2');assert.equal(operation.submission.sequence,1);
   assert.equal(operation.normalSpinVerified,true);assert.equal(operation.verificationRequired,true);assert.equal(operation.verification.kind,'spin');assert.equal(operation.verification.payload.pur,undefined);
   assert.equal(normalSpins,1);assert.deepEqual(clicks,['alpha','spin']);assert.equal(entries.length,3);assert(!JSON.stringify(result).includes('private'));
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
  else{assert.equal(reference.path,path.join(artifactDir,'all-branches.har'));const saved=JSON.parse(await fs.readFile(reference.path,'utf8'));assert.equal(saved.log.entries.length,entries.length);}
 }
 console.log(JSON.stringify({scenario,creates,closes,normalSpins,wallMs:performance.now()-wallStart}));
}finally{mock.restoreAll();await fs.rm(artifactDir,{recursive:true,force:true});}
