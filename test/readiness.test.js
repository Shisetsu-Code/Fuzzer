import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyDrawnState,stateSignature,waitForStableState} from '../providers/pragmatic/readiness.js';

const button=(path,label='')=>({path,name:path.split('/').at(-1),hit_rect:{x:0,y:0,width:5,height:5},labels:label?[label]:[]});
const scene=(...paths)=>({controls:paths.map(p=>button(p))});
const intro=scene('GameRoot/IntroScreen/Content/IntroButtonsNewer/PlayButtonIntro');
const base=scene('GameRoot/Game/GameFeatures/FeaturePurchase/MainButton/ColliderBuy');
const menu=scene('GameRoot/Game/FeaturePurchase/PurchaseWindow/content/Options/Option1/Collider');
const confirm=scene('GameRoot/Game/FeaturePurchase/ConfirmPurchaseWindow/content/AcceptButton/ColliderOption1');

test('classifies intro/base/menu/confirm without mistaking generic canvas collider for readiness',()=>{
 assert.equal(classifyDrawnState(intro),'INTRO');
 assert.equal(classifyDrawnState(base),'BASE_CONTROLS');
 assert.equal(classifyDrawnState(menu),'PURCHASE_OPTIONS');
 assert.equal(classifyDrawnState(confirm),'CONFIRM_PURCHASE');
 assert.equal(classifyDrawnState(scene('GameRoot/Canvas/Collider')),'UNKNOWN');
 assert.equal(classifyDrawnState({controls:[{path:'IntroScreen/FakeButton'}]}),'UNKNOWN');
});

test('ordinary-spin-only base is recognized after intro without purchase controls',()=>{
 const state={controls:[{path:'GameRoot/SpinPanel/SpinButton',name:'SpinButton',
  hit_rect:{x:100,y:100,width:40,height:40},
  handlers:[{event:'Evt_DataToCode_Pressed_Spin'}],labels:[]}]};
 assert.equal(classifyDrawnState(state),'BASE_CONTROLS');
 const hidden={controls:[{...state.controls[0],hit_rect:null}]};
 assert.equal(classifyDrawnState(hidden),'UNKNOWN');
});
test('stable gate returns after two matching samples, not a seven second sleep',async()=>{
 let time=0,calls=0;
 const result=await waitForStableState({
  observe:async()=>{calls++;return calls<3?intro:base;},
  now:()=>time,sleep:async ms=>{time+=ms},pollMs:200,minStable:2,
  timeoutMs:4000,expected:['BASE_CONTROLS']
 });
 assert.equal(result.status,'STABLE');assert.equal(result.kind,'BASE_CONTROLS');
 assert.equal(result.samples,4);assert.equal(result.elapsedMs,600);
 assert.equal(result.visuallyVerified,false);
});
test('cookie overlay prevents accepting otherwise stable canvas buttons',async()=>{
 let time=0,cycles=0;
 const result=await waitForStableState({
  observe:async()=>{cycles++;return base;},
  isBlocked:async()=>cycles<=4,
  now:()=>time,sleep:async ms=>{time+=ms},pollMs:100,minStable:2,timeoutMs:2000
 });
 assert.equal(result.status,'STABLE');assert.equal(result.samples,6);
});
test('an unstable menu never receives a ready verdict',async()=>{
 let time=0,calls=0;
 const result=await waitForStableState({
  observe:async()=>++calls%2?menu:confirm,
  now:()=>time,sleep:async ms=>{time+=ms},pollMs:100,minStable:2,timeoutMs:900
 });
 assert.equal(result.status,'TIMEOUT');assert.equal(result.visuallyVerified,false);
});
test('changed controls reset the stability counter even within the same state',async()=>{
 let time=0,count=0;
 const a=scene('Game/GameFeatures/FeaturePurchase/MainButton/ColliderBuy');
 const b={controls:[{...button('Game/GameFeatures/FeaturePurchase/MainButton/ColliderBuy'),labels:['NEW PRICE']}]};
 assert.notEqual(stateSignature(a),stateSignature(b));
 const result=await waitForStableState({
  observe:async()=>++count%2?a:b,
  now:()=>time,sleep:async ms=>{time+=ms},pollMs:100,minStable:2,timeoutMs:700
 });
 assert.equal(result.status,'TIMEOUT');
});
test('requires actual observer and refuses one-sample stability',async()=>{
 await assert.rejects(()=>waitForStableState({}),/observe callback/);
 await assert.rejects(()=>waitForStableState({observe:async()=>base,minStable:1}),/minStable/);
});
