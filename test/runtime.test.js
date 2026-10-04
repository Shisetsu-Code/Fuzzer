import test from 'node:test';
import assert from 'node:assert/strict';
import {pragmatic} from '../providers/pragmatic/parser/runtime.js';
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
test('the last advertised free spin still advances while runtime proves the feature active',async()=>{
 const events=[];globalThis.Vars={Evt_ToServer_RequestSpin:'spin'};globalThis.XT={TriggerEvent:e=>events.push(e)};
 try{const provider={...pragmatic,protocolState:async()=>({canSpin:true,logicIsFreeSpin:true})};const result=await provider.continueProtocol({evaluate:async(fn,arg)=>fn(arg)},{na:'s',fs:'15',fsmax:'15'});assert.equal(result.kind,'protocol-spin');assert.deepEqual(events,['spin']);}
 finally{delete globalThis.Vars;delete globalThis.XT;}
});
test('feature spins use the UI lifecycle event before the direct server event',async()=>{
 const events=[];globalThis.Vars={Evt_ToServer_RequestSpin:'server',Evt_DataToCode_Pressed_Spin:'ui'};globalThis.XT={TriggerEvent:e=>events.push(e)};
 try{const provider={...pragmatic,protocolState:async()=>({canSpin:true,logicIsFreeSpin:true})};await provider.continueProtocol({evaluate:async(fn,arg)=>fn(arg)},{na:'s',fs:'2',fsmax:'15'});assert.deepEqual(events,['ui']);}
 finally{delete globalThis.Vars;delete globalThis.XT;}
});
