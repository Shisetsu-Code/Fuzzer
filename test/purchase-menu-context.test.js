import test from 'node:test';import assert from 'node:assert/strict';
import * as known from '../providers/pragmatic/known-controls.js';
const prefix='GameRoot/UI Root/XTRoot/Root/Game/GameFeatures/FeaturePurchase/FSPurchaseOptions';
const control=name=>({path:prefix+'/ConfirmationWindow/content/Buttons/'+name,name,enabled:true,handlers:[{kind:'CATButton',index:name==='ButtonNo'?6:7}],hit_rect:{x:name==='ButtonNo'?336:615,y:366,width:73,height:70}});
test('live V2 confirmation controls establish menu context even when legacy flag is false',()=>{
 assert.equal(typeof known.purchaseMenuContext,'function');
 const context=known.purchaseMenuContext([control('ButtonNo'),control('ButtonYes0')],{open:false,options:[]});
 assert.equal(context.open,true);assert.equal(context.source,'OBSERVED_PURCHASE_CONTROLS');
});
test('purchase entry alone, hidden or disabled controls never establish a ready modal',()=>{
 assert.equal(typeof known.purchaseMenuContext,'function');
 for(const controls of [[{...control('Collider'),path:'Game/FeaturePurchase/FSPurchaseMainButton/Collider'}],[{...control('ButtonYes0'),enabled:false}],[{...control('ButtonYes0'),hit_rect:null}]])assert.equal(known.purchaseMenuContext(controls,{open:false}).open,false);
});
test('legacy menu readiness remains conservative when no usable projected controls exist',()=>{
 assert.equal(typeof known.purchaseMenuContext,'function');assert.equal(known.purchaseMenuContext([],{open:true}).open,true);
});

test('a backdrop is an open menu, not a ready purchase confirmation',()=>{
 const backdrop=control('Blocker');const context=known.purchaseMenuContext([backdrop],{open:false});
 assert.equal(context.open,true);assert.equal(context.ready,false);
 assert.equal(known.purchaseMenuContext([backdrop,control('ButtonYes0')],{open:false}).ready,true);
});
test('a purchase modal excludes still-active background controls and generic bet arrows',()=>{
 const result=known.filterKnownControls([control('ButtonYes0'),{path:'Game/AnteBet/Level0',name:'AnteBet',handlers:[{event:'AnteBet'}],hit_rect:{x:0,y:0,width:1,height:1}},{path:'GUI/RightGroup/BetButtons/BetUp_Button',name:'BetUp_Button',handlers:[{event:'SmartIncreaseBet'}],hit_rect:{x:0,y:0,width:1,height:1}}],{menuOpen:true,restrictToPurchaseMenu:true,includeWagerAdjustments:true});
 assert.deepEqual(result.keep.map(c=>c.name),['ButtonYes0']);
 assert.deepEqual(result.discarded.map(c=>c.discard_reason),['modal_background','modal_background']);
});
