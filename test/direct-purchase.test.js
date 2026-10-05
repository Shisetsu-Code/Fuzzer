import test from 'node:test';
import assert from 'node:assert/strict';
import {pragmatic,resultCountingStopAvailable} from '../providers/pragmatic/parser/runtime.js';
for(const accepts of [true,false])test(`direct purchase uses the discovered controller without UI or forced selection (${accepts})`,async()=>{
 const keys=['window','globalRuntime','XT','Vars','FeaturePurchaseManager','FeaturePurchaseV2'];
 const old=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));let calls=0;const selection={purchaseIndex:-1};
 globalThis.window=globalThis;globalThis.FeaturePurchaseManager=class{};
 globalThis.Vars={FeaturePurchase:'selection',CanSpin:'ready',FeaturePurchaseWindowIsOpen:'menu'};
 globalThis.XT={GetObject:()=>selection,GetBool:k=>k==='ready'};
 const manager={purchaseCosts:[100,200],PurchaseFeature(index){calls++;if(accepts)selection.purchaseIndex=index;}};
 globalThis.globalRuntime={sceneRoots:[{GetComponentsInChildren:type=>type===FeaturePurchaseManager?[manager]:[]}]};
 try{const result=await pragmatic.purchaseDirect({evaluate:async(fn,arg)=>fn(arg)},1);assert.equal(result.available,true);assert.equal(result.ok,accepts);assert.equal(calls,1);assert.equal(selection.purchaseIndex,accepts?1:-1);assert.equal(result.controller.kind,'FeaturePurchaseManager');}
 finally{for(const k of keys){if(old[k]===undefined)delete globalThis[k];else globalThis[k]=old[k];}}
});
test('an invoked but unconfirmed direct purchase never falls through to a second purchase',async()=>{
 let fallback=false;
 const provider={...pragmatic,waitReady:async()=>({ok:true}),purchaseDirect:async()=>({available:true,ok:false,reason:'DIRECT_PURCHASE_NOT_CONFIRMED'})};
 const result=await provider.purchase({evaluate:async()=>{fallback=true;}},0);
 assert.equal(result.ok,false);assert.equal(fallback,false);
});
test('controlled bet changes prefer the available exact runtime event over the UI button',async()=>{
 const keys=['window','globalRuntime','XT','Vars'];const old=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));let event=null;
 globalThis.window=globalThis;globalThis.globalRuntime={sceneRoots:[]};
 globalThis.Vars={Evt_DataToCode_SmartIncreaseBet:'increase'};globalThis.XT={TriggerEvent:value=>{event=value;}};
 try{const result=await pragmatic.press({evaluate:async(fn,arg)=>fn(arg)},'bet_increase');assert.equal(event,'increase');assert.equal(result.strategy,'direct bet runtime event');}
 finally{for(const k of keys){if(old[k]===undefined)delete globalThis[k];else globalThis[k]=old[k];}}
});
test('a free-spin stage ready for its next spin must not be intercepted by an idle Stop',()=>{
 assert.equal(resultCountingStopAvailable({canSpin:true,logicIsFreeSpin:true,stages:[{name:'StageResultFreeSpin',mustSpin:true}],stopControls:[{active:true,event:'Evt_DataToCode_Pressed_Stop'}],pickerControls:[]}),false);
});
