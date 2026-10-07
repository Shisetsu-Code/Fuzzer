import assert from 'node:assert/strict';
import {mock} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const artifactDir=await fs.mkdtemp(path.join(os.tmpdir(),'campaign-adapter-'));
let clock=1000000,creates=0,closes=0,entries=[];
const owned=new Set(),clicked=[];
const button=(name,x,y,event)=>({root:0,path:`Game/${name}`,name,labels:[],sprite_names:[name],handlers:[{kind:'XTButton',index:x,event}],drawn_rect:{x,y,width:20,height:20},hit_rect:{x,y,width:20,height:20},enabled:true,clickable:'RUNTIME_COLLIDER'});
const controls=[button('StartSpin_Button',70,10,'Evt_DataToCode_Pressed_Spin'),button('FeatureAlpha',10,10,'Evt_Alpha'),button('FeatureBeta',35,10,'Evt_Beta'),button('FeatureGamma',10,40,'Evt_Gamma')];
const raw=()=>({supported:true,viewport:{width:100,height:100},controls,unresolved:[]});
const controller={tabs:{activate:async()=>{}},withTab:()=>({networkEvents:()=>entries,click:async(x,y)=>{
 assert.ok(x<70,'no extra normal spin is allowed');clicked.push([x,y]);
 entries.push({request:{url:'https://demogamesfree.pragmaticplay.net/gs2c/gameService',postData:{text:'action=doSpin&pur=0&c=0.1&l=20'}},response:{status:200,content:{text:'na=s&balance=99900'}}});return {ok:true};
}})};
mock.module(new URL('../../integrations/hardfire/session.js',import.meta.url).href,{namedExports:{createHardFireSession:async(_controller,options)=>{
 assert.equal(owned.size,0,'the previous session must be closed before a new one is created');creates++;entries=[];
 const session={tabId:42,provider:{protocolState:async()=>({canSpin:true,stages:[],pickerControls:[],logicIsFreeSpin:false,respinInProgress:false,spinBlockingFeatureIsRunning:false,stopActive:false,lastWinIsCounting:false,waitInResultForBigWin:false})},
 frame:{evaluate:async fn=>fn.name==='inspectDrawnButtons'?raw():{balance:100000,balanceSource:'runtime:BalanceDisplayed.GetDouble',candidates:[]}},
 protocolCapture:()=>({entries,marker:JSON.stringify(entries),pending:false,uncertain:false}),entries:async()=>entries,purchaseMenu:async()=>({open:false}),observe:async()=>({phase:'base'}),
 close:async()=>{closes++;const harPath=path.join(artifactDir,`owned-${creates}.har`);await fs.writeFile(harPath,JSON.stringify({log:{entries}}));session.har={path:harPath};options.onClosedTab(42);}};
 options.onOwnedTab(42,()=>session.close());return session;
}}});
mock.module(new URL('../../integrations/hardfire/drawn-buttons.js',import.meta.url).href,{namedExports:{captureDrawnButtons:async()=>({capture_id:'capture',full_path:path.join(artifactDir,'screen.jpg'),artifact_dir:artifactDir,image_size:{width:100,height:100},controls:controls.map(b=>({...b,center:{x:(b.hit_rect.x+10)/100,y:(b.hit_rect.y+10)/100}}))})}});
mock.module(new URL('../../integrations/hardfire/paint-guard.js',import.meta.url).href,{namedExports:{withSurfaceLock:async fn=>fn(),ensurePainted:async()=>({ok:true})}});
mock.method(Date,'now',()=>clock);
mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{clock+=ms;queueMicrotask(()=>fn(...args));return 1;});
try{
 const {runStateExplorer}=await import('../../integrations/hardfire/state-explorer.js');
 const result=await runStateExplorer(controller,{gameUrl:'https://www.pragmaticplay.fun/en/slots/example/',artifactDir,mode:'actions',maxActions:5,maxRetries:0,timeoutMs:60000,sliceAttempts:1,onOwnedTab:id=>owned.add(id),onClosedTab:id=>owned.delete(id)});
 assert.ok(result.campaign);assert.equal(result.campaign.slices,3);
 assert.equal(result.status,'EXHAUSTED_OBSERVED_CONTROLS');assert.equal(result.actions,3);assert.equal(result.completeGame,false);
 assert.deepEqual(result.edges.map(e=>e.action),controls.slice(1).map(c=>c.path));
 assert.equal(creates,3);assert.equal(closes,3);assert.equal(clicked.length,3);assert.equal(owned.size,0);assert.equal(result.savedHarPaths.length,3);
 for(const file of result.savedHarPaths)await fs.access(file);
 const reference=JSON.parse(await fs.readFile(path.join(artifactDir,'har-reference.json'),'utf8'));
 const har=JSON.parse(await fs.readFile(reference.path,'utf8'));assert.equal(har.log.entries.length,3);
 console.log(JSON.stringify({scenario:'campaign',creates,closes,actions:result.actions,slices:result.campaign.slices,harEntries:har.log.entries.length}));
}finally{mock.restoreAll();await fs.rm(artifactDir,{recursive:true,force:true});}
