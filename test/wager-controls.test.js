import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {filterKnownControls} from '../providers/pragmatic/known-controls.js';
import {readRuntimeBalance} from '../providers/pragmatic/wager-evidence.js';
import {createNavigationKey,exploreStates} from '../providers/pragmatic/state-explorer.js';
const c=(name,event)=>({name,path:'GUI/'+name,handlers:[{event}],hit_rect:{x:0,y:0,width:10,height:10},enabled:true});
const up=c('BetUp_Button','Evt_DataToCode_SmartIncreaseBet'),down=c('BetDown_Button','Evt_DataToCode_SmartDecreaseBet');
test('wager changes remain excluded from base, but become bounded configuration controls in a purchase menu',()=>{
 const items=[up,down,c('SoundOn','Pressed_SoundBtn'),c('ConfirmPurchase','ConfirmPurchase')];
 assert.equal(filterKnownControls(items,{includeWagerAdjustments:true,menuOpen:false}).keep.length,1);
 const menu=filterKnownControls(items,{includeWagerAdjustments:true,menuOpen:true});
 assert.deepEqual(menu.keep.filter(c=>c.role==='wager-adjustment').map(c=>c.wagerDirection),['increase','decrease']);
 assert.deepEqual(menu.discarded.map(c=>c.discard_reason),['sound']);
 assert.equal(filterKnownControls(items).keep.length,1,'the default universal filter stays unchanged');
});
test('a wager control without geometry is unresolved, not blindly dispatched',()=>{
 const result=filterKnownControls([{...up,hit_rect:null}],{includeWagerAdjustments:true,menuOpen:true,requireHitRect:true});
 assert.equal(result.keep.length,0);assert.equal(result.unresolved.length,1);
});
test('runtime wager amount is observed directly even when changing it produces no request',()=>{
 const Vars={BalanceDisplayed:'balance',TotalBetDisplayed:'bet'},XT={GetDouble:k=>k==='balance'?10000:2};
 const out=vm.runInNewContext('('+readRuntimeBalance.toString()+')()',{Vars,XT});
 assert.equal(out.betAmount,2);assert.equal(out.betSource,'runtime:TotalBetDisplayed.GetDouble');
});
test('navigation distinguishes sampled amounts but never uses balance as identity',()=>{
 const menu={controls:[c('ConfirmPurchase','ConfirmPurchase')],wager:{menuOpen:true,betAmount:2,betSource:'runtime:TotalBetDisplayed.GetDouble',balance:100}};
 const key=createNavigationKey(menu);
 assert.notEqual(key,createNavigationKey({...menu,wager:{...menu.wager,betAmount:3}}));
 assert.equal(key,createNavigationKey({...menu,wager:{...menu.wager,balance:50}}));
});
test('single-step wager sampling reaches confirmation at current, lower and higher amount without +/- loops',async()=>{
 let amount=2,phase='menu',t=0;const confirms=[];
 const snap=()=>({key:phase==='done'?'done':String(amount),controls:phase==='done'?[]:[{key:'confirm'},...['increase','decrease'].map((dir,i)=>({key:dir,role:'wager-adjustment',wagerDirection:dir,enabled:amount+(i?-1:1)>0}))],wager:{menuOpen:phase==='menu',betAmount:amount},inputReady:true,capture:{pending:false,uncertain:false}});
 const a={now:()=>t,reset:async()=>{amount=2;phase='menu';},snapshot:async()=>snap(),click:async c=>{t++;if(c.key==='confirm'){confirms.push(amount);phase='done';}else amount+=c.key==='increase'?1:-1;}};
 const result=await exploreStates(a,{mode:'actions',maxActions:50,maxDepth:8,maxRetries:0,wait:async()=>({snapshot:snap(),reason:'STATE_CHANGED'})});
 assert.deepEqual(confirms.sort((a,b)=>a-b),[1,2,3]);
 assert.equal(result.stopReason,'EXHAUSTED_OBSERVED_CONTROLS');
 assert.equal(result.coverage.wagerSampling,'one-step-per-route');
 assert.equal(result.edges.filter(e=>e.configurationChange).length,2);
});
