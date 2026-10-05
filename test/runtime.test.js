import test from 'node:test';
import assert from 'node:assert/strict';
import {pragmatic} from '../providers/pragmatic/parser/runtime.js';
test('spin never matches the active stop-spin button by substring',async()=>{
 const events=[];globalThis.window=globalThis;globalThis.XTButton=class {};globalThis.Vars={Evt_DataToCode_Pressed_Spin:'Evt_DataToCode_Pressed_Spin'};globalThis.XT={TriggerEvent:e=>events.push(e)};globalThis.globalRuntime={sceneRoots:[{GetComponentsInChildren:()=>[{gameObject:{name:'StopSpin_Button',activeInHierarchy:true},eventToCode:{name:'Evt_DataToCode_Pressed_Stop'},OnClick:()=>events.push('stop')}]}]};
 try{const result=await pragmatic.press({evaluate:async(fn,arg)=>fn(arg)},'spin');assert.equal(result.ok,true);assert.deepEqual(events,['Evt_DataToCode_Pressed_Spin']);}
 finally{delete globalThis.window;delete globalThis.XTButton;delete globalThis.Vars;delete globalThis.XT;delete globalThis.globalRuntime;}
});
test('spin targets the active button instead of an earlier hidden copy of the same event',async()=>{
 const clicked=[];globalThis.window=globalThis;globalThis.XTButton=class {};globalThis.Vars={Evt_DataToCode_Pressed_Spin:'Evt_DataToCode_Pressed_Spin'};globalThis.XT={};globalThis.globalRuntime={sceneRoots:[{GetComponentsInChildren:()=>[false,true].map((active,index)=>({gameObject:{name:'Spin_Button',activeInHierarchy:active},eventToCode:{name:'Evt_DataToCode_Pressed_Spin'},OnClick:()=>clicked.push(index)}))}]};
 try{const result=await pragmatic.press({evaluate:async(fn,arg)=>fn(arg)},'spin');assert.equal(result.ok,true);assert.deepEqual(clicked,[1]);}
 finally{delete globalThis.window;delete globalThis.XTButton;delete globalThis.Vars;delete globalThis.XT;delete globalThis.globalRuntime;}
});
test('a purchased cascade can advance before free spins are awarded',async()=>{
 const events=[];globalThis.Vars={Evt_ToServer_RequestSpin:'spin'};globalThis.XT={TriggerEvent:e=>events.push(e)};
 try{const provider={...pragmatic,protocolState:async()=>({canSpin:true})};const result=await provider.continueProtocol({evaluate:async(fn,arg)=>fn(arg)},{na:'s',rs_c:'1',rs_p:'0',rs_m:'1'});assert.equal(result.ok,true);assert.deepEqual(events,['spin']);}
 finally{delete globalThis.Vars;delete globalThis.XT;}
});
test('a bonus response received while reels spin stops the visual stage before bonus selection',async()=>{
 const events=[];globalThis.Vars={Evt_DataToCode_Pressed_Stop:'stop'};globalThis.XT={TriggerEvent:e=>events.push(e)};
 try{const provider={...pragmatic,protocolState:async()=>({stages:[{name:'StageSpin'}]})};const result=await provider.continueProtocol({evaluate:async(fn,arg)=>fn(arg)},{na:'b'});assert.equal(result.kind,'spin-animation-stop');assert.deepEqual(events,['stop']);}
 finally{delete globalThis.Vars;delete globalThis.XT;}
});
test('an actual free spin stage awaiting confirmation takes priority over CanSpin',async()=>{
 const events=[];globalThis.Vars={Evt_DataToCode_ConfirmFSStart:'confirm',Evt_DataToCode_Pressed_Spin:'spin'};globalThis.XT={TriggerEvent:e=>events.push(e)};
 try{const provider={...pragmatic,protocolState:async()=>({canSpin:true,fsStartNeedsConfirmation:true,stages:[{name:'StageResultFreeSpin',fsStartConfirmed:false}]})};const result=await provider.continueProtocol({evaluate:async(fn,arg)=>fn(arg)},{na:'s',fs:'1',fsmax:'15'});assert.equal(result.kind,'confirm-fs-start');assert.deepEqual(events,['confirm']);}
 finally{delete globalThis.Vars;delete globalThis.XT;}
});
test('enumerates every configured ante level and rejects a changed level before activation',async()=>{
 const manager={featureAvailable:true,xtEnabled:true,betLevelSettings:{betLevelIndex:0,betLevelScale:[20,25,40,60]},CanEnableBetLevel:()=>true,SetBetLevel(level){this.betLevelSettings.betLevelIndex=level;}};
 globalThis.BetLevelV2=class {};globalThis.globalRuntime={sceneRoots:[{GetComponentsInChildren:()=>[manager]}]};globalThis.XT={GetBool:()=>false};
 try{const frame={evaluate:async(fn,arg)=>fn(arg)};const levels=await pragmatic.listBetLevels(frame);assert.deepEqual(levels.map(l=>l.multiplier),[1.25,2,3]);assert.equal((await pragmatic.setBetLevel(frame,levels[2])).ok,true);manager.betLevelSettings.betLevelScale[1]=30;assert.equal((await pragmatic.setBetLevel(frame,levels[0])).ok,false);}
 finally{delete globalThis.BetLevelV2;delete globalThis.globalRuntime;delete globalThis.XT;}
});
test('an actionable cascade advances the server instead of stopping an already completed animation',async()=>{
 const events=[];globalThis.Vars={Evt_ToServer_RequestSpin:'spin',Evt_DataToCode_Pressed_Stop:'stop'};
 globalThis.XT={TriggerEvent:e=>events.push(e)};
 const provider={...pragmatic,protocolState:async()=>({canSpin:true,stopActive:true})};
 try{const result=await provider.continueProtocol({evaluate:async(fn,arg)=>fn(arg)},{na:'s',rs:'mc',fs:'2',fsmax:'15'});assert.equal(result.kind,'protocol-spin');assert.deepEqual(events,['spin']);}
 finally{delete globalThis.Vars;delete globalThis.XT;}
});
test('identical picker labels use their exact original component index',async()=>{
 const clicked=[];const buttons=[0,1].map(i=>({gameObject:{name:'Choice',activeInHierarchy:true},eventToCode:{name:'Pick'},OnClick:()=>clicked.push(i)}));
 globalThis.XTButton=class {};globalThis.globalRuntime={sceneRoots:[{GetComponentsInChildren:()=>buttons}]};
 try{await pragmatic.pressProtocolChoice({evaluate:async(fn,arg)=>fn(arg)},{root:0,index:1,name:'Choice',event:'Pick'});assert.deepEqual(clicked,[1]);}
 finally{delete globalThis.XTButton;delete globalThis.globalRuntime;}
});
test('the last free spin waits for the runtime lifecycle',async()=>{
 const events=[];globalThis.Vars={Evt_ToServer_RequestSpin:'spin'};globalThis.XT={TriggerEvent:e=>events.push(e)};
 try{const provider={...pragmatic,protocolState:async()=>({canSpin:true,logicIsFreeSpin:true})};const result=await provider.continueProtocol({evaluate:async(fn,arg)=>fn(arg)},{na:'s',fs:'15',fsmax:'15'});assert.equal(result.kind,'feature-wait');assert.deepEqual(events,[]);}
 finally{delete globalThis.Vars;delete globalThis.XT;}
});
test('free spins are scheduled by their stage instead of resending a spin event',async()=>{
 const events=[];globalThis.Vars={Evt_ToServer_RequestSpin:'server',Evt_DataToCode_Pressed_Spin:'ui'};globalThis.XT={TriggerEvent:e=>events.push(e)};
 try{const provider={...pragmatic,protocolState:async()=>({canSpin:true,logicIsFreeSpin:true})};await provider.continueProtocol({evaluate:async(fn,arg)=>fn(arg)},{na:'s',fs:'2',fsmax:'15'});assert.deepEqual(events,[]);}
 finally{delete globalThis.Vars;delete globalThis.XT;}
});
