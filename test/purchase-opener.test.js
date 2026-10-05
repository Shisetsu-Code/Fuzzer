import test from 'node:test';
import assert from 'node:assert/strict';
import {pragmatic} from '../providers/pragmatic/parser/runtime.js';
for(const betMenuOpen of [true,false])test(`purchase opener clears bet menu without duplicating opened purchase (${betMenuOpen})`,async()=>{
 const keys=['window','globalRuntime','XTButton','XT','Vars','FeaturePurchaseOption'];
 const old=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 let menu=betMenuOpen,opened=false;const clicks=[];const selected={purchaseIndex:-1};
 globalThis.window=globalThis;globalThis.XTButton=class{};globalThis.FeaturePurchaseOption=class{};
 globalThis.Vars={FeaturePurchase:'purchase',FeaturePurchaseWindowIsOpen:'open',CanSpin:'spin'};
 globalThis.XT={GetBool:k=>k==='open'?opened:true,GetObject:()=>selected};
 const button={gameObject:{name:'Buy_Button',activeInHierarchy:true},eventToCode:{name:'BuyFeature'},OnPress(down){if(!down)return;clicks.push(Date.now());if(menu)menu=false;else opened=true;}};
 const option={type:0,purchaseIndex:0,gameObject:{activeInHierarchy:true},OnClick(){selected.purchaseIndex=0;opened=false;}};
 globalThis.globalRuntime={sceneRoots:[{GetComponentsInChildren:type=>type===XTButton?[button]:[option]}]};
 try{
  const provider={...pragmatic,waitReady:async()=>({ok:true})};
  const result=await provider.purchase({evaluate:async(fn,arg)=>fn(arg)},0);
  assert.equal(result.ok,true);assert.equal(clicks.length,betMenuOpen?2:1);
  if(betMenuOpen)assert.ok(clicks[1]-clicks[0]>=990);
 }finally{for(const k of keys){if(old[k]===undefined)delete globalThis[k];else globalThis[k]=old[k];}}
});
