import test from 'node:test';
import assert from 'node:assert/strict';
import {PragmaticSession} from '../providers/pragmatic/session.js';
for(const choices of [false,true])test(`accepted Hold and Spinner intro receives a five-second center fallback, choices=${choices}`,async()=>{
 const original=Date.now;let time=100000,clicked=false;const clicks=[];
 const state={canSpin:true,logicIsFreeSpin:false,stages:[],pickerControls:choices?[{active:true}]:[]};
 const s=new PragmaticSession({provider:{protocolState:async()=>state},clickContinue:async()=>{clicks.push(time);clicked=true;return {ok:true};}});
 s.started=true;s.purchaseAccepted=true;s.pendingKind='continue';s.pendingMarker='before';s.pendingResult={ok:true,kind:'protocol-spin'};s.latestExchange=async()=>({na:'s',rs_c:'1',rs_m:'4'});s.wireMarker=async()=>clicked?'after':'before';s.purchaseMenu=async()=>({open:false});
 Date.now=()=>time+=200;
 try{assert.equal(await s.waitForTransition({state},{deadline:113000}),!choices);assert.equal(clicks.length,choices?0:1);if(!choices){assert.ok(clicks[0]>=105000);assert.equal(s.pendingResult.centerFallbackClicks,1);}}
 finally{Date.now=original;}
});
test('a stuck spin refreshes its surface without clicking or buying again',async()=>{
 const original=Date.now;let time=100000,refreshed=false,calls=0;
 const state={canSpin:false,stages:[{name:'StageSpin'}],pickerControls:[]};
 const s=new PragmaticSession({provider:{protocolState:async()=>state},maintainSurface:async()=>{calls++;refreshed=true;return {ok:true};},clickContinue:async()=>assert.fail('no blind spin click')});
 s.latestExchange=async()=>({na:'b'});s.wireMarker=async()=>refreshed?'after':'before';s.purchaseMenu=async()=>({open:false});s.pendingMarker='before';s.pendingKind='continue';s.waitingOnly=true;
 Date.now=()=>time+=1000;
 try{assert.equal(await s.waitForTransition({state},{deadline:130000}),true);assert.equal(calls,1);}
 finally{Date.now=original;}
});
test('a stalled continuation performs one native entry recovery and records it',async()=>{
 const original=Date.now;let time=100000,recovered=false,calls=0;
 const s=new PragmaticSession({provider:{protocolState:async()=>({canSpin:true}),recoverFeatureStart:async()=>{calls++;recovered=true;return {ok:true,kind:'feature-entry-recovery'};}}});
 s.latestExchange=async()=>({na:'s'});s.wireMarker=async()=>recovered?'after':'before';s.pendingMarker='before';s.pendingKind='continue';s.waitingOnly=true;s.pendingResult={kind:'feature-wait'};
 Date.now=()=>time+=800;
 try{assert.equal(await s.waitForTransition({state:{canSpin:true}},{deadline:130000}),true);assert.equal(calls,1);assert.equal(s.pendingResult.recovery.kind,'feature-entry-recovery');}
 finally{Date.now=original;}
});
test('preparation waits for a late initialization reply rather than ending at ten seconds',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});let observations=0;
 const s=new PragmaticSession({frame:{},entries:async()=>[],provider:{waitReady:async()=>({ok:true})}});
 s.syncInit=async()=>{t.mock.timers.tick(11000);if(++observations===2)s.initial={count:0};};s.verifyBase=async()=>true;
 const pending=s.prepare();await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(200);await pending;assert.equal(observations,2);
});
test('an acknowledged choice waits for the old panel to close before discovering another menu',async()=>{
 let observations=0,clicks=0;const control={root:1,name:'Collider',event:'Pick',index:0,active:true};
 const s=new PragmaticSession({frame:{},entries:async()=>[],provider:{protocolState:async()=>({pickerControls:++observations<3?[control]:[]})},clickContinue:async()=>{clicks++;return {ok:true};}});
 s.pendingKind='pick';s.pendingMarker='before';s.wireMarker=async()=> 'after';
 assert.equal(await s.waitForTransition({options:[{kind:'pick',control}]},{deadline:Date.now()+2000}),true);assert.equal(observations,3);assert.equal(clicks,0);
});
test('a submitted purchase waits and clicks its intro without sending another purchase',async()=>{
 let clicked=false,clicks=0;
 const state={canSpin:false,stages:[{name:'StageResultFreeSpin'}],pickerControls:[]};
 const s=new PragmaticSession({frame:{},entries:async()=>[],provider:{protocolState:async()=>state},clickContinue:async()=>{clicked=true;clicks++;return {ok:true};}});
 s.purchaseMenu=async()=>({open:false});s.pendingKind='buy';s.pendingMarker='before';s.wireMarker=async()=>clicked?'after':'before';
 assert.equal(await s.waitForTransition({state},{deadline:Date.now()+3500}),true);assert.equal(clicks,1);
});
test('unavailable feature start waits but visible selections are left for the graph',async()=>{
 for(const active of [false,true]){
  const result={ok:false,kind:'bonus-pick',needsSelection:true,choices:[{active}]};
  const state={stages:[{name:'StageResult'}],pickerControls:active?[{active:true}]:[]};
  const s=new PragmaticSession({frame:{},entries:async()=>[],provider:{protocolState:async()=>state,continueProtocol:async()=>result}});
  s.purchaseMenu=async()=>({open:false});
  const performed=await s.perform({kind:'continue'});assert.equal(performed.ok,!active);assert.equal(s.waitingOnly,!active);
 }
});
test('bonus entry with inactive choices waits for its intro instead of failing',async()=>{
 const state={mustOpenBonus:true,stages:[{name:'StageResult'}],pickerControls:[{active:false}]};
 const s=new PragmaticSession({frame:{},entries:async()=>[],provider:{protocolState:async()=>state,continueProtocol:async()=>({ok:false,kind:'bonus-init',needsBonusInit:true,choices:[]})}});
 s.purchaseMenu=async()=>({open:false});
 const result=await s.perform({kind:'continue'});assert.equal(result.ok,true);assert.equal(result.waiting,true);assert.equal(s.waitingOnly,true);
});
test('waiting continuation can dismiss a center prompt and then observes available controls',async()=>{
 let continued=false,clicks=0;
 const state=()=>({canSpin:continued,stages:[{name:'StageResultFreeSpin'}],pickerControls:[]});
 const s=new PragmaticSession({frame:{},entries:async()=>[],provider:{protocolState:async()=>state()},clickContinue:async()=>{clicks++;continued=true;return {ok:true};}});
 s.purchaseMenu=async()=>({open:false});s.pendingKind='continue';s.waitingOnly=true;
 const result=await s.waitForTransition({state:state()},{deadline:Date.now()+3500});
 assert.equal(result,true);assert.equal(clicks,1);
});
test('collect UI waiting also dismisses a center prompt before considering the feature stuck',async()=>{
 let continued=false,clicks=0;
 const state=()=>({canSpin:continued,logicIsFreeSpin:!continued,stages:[{name:'StageResultFreeSpin'}],pickerControls:[]});
 const s=new PragmaticSession({frame:{},entries:async()=>[],provider:{protocolState:async()=>state()},clickContinue:async()=>{clicks++;continued=true;return {ok:true};}});
 s.purchaseMenu=async()=>({open:false});s.pendingKind='continue';s.waitingOnly=true;s.awaitingFinish=true;
 assert.equal(await s.waitForTransition({state:state()},{deadline:Date.now()+3500}),true);assert.equal(clicks,1);
});
test('ordinary rounds wait for a center confirmation instead of timing out mid result',async()=>{
 let continued=true,clicks=0;const entries=[{startedDateTime:'init',request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doInit'}},response:{status:200,content:{text:'na=s'}}}];
 const state=()=>({canSpin:continued,logicIsFreeSpin:false,spinBlockingFeatureIsRunning:false,stages:[{name:'StageResult'}],pickerControls:[]});
 const s=new PragmaticSession({frame:{},entries:async()=>entries,provider:{protocolState:async()=>state(),press:async()=>{continued=false;entries.push({startedDateTime:String(entries.length),request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doSpin&c=0.1&l=20'}},response:{status:200,content:{text:'na=s'}}});return {ok:true};}},clickContinue:async()=>{clicks++;continued=true;return {ok:true};}});
 s.purchaseMenu=async()=>({open:false});
 assert.equal(await s.verifyBase(),true);assert.equal(clicks,2);assert.equal(entries.length,3);
});
test('purchase closure can verify exactly one fresh ordinary spin',async()=>{
 const entries=[{startedDateTime:'init',request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doInit'}},response:{status:200,content:{text:'na=s'}}}];
 const state={canSpin:true,logicIsFreeSpin:false,spinBlockingFeatureIsRunning:false,pickerControls:[]};
 const s=new PragmaticSession({frame:{},entries:async()=>entries,provider:{protocolState:async()=>state,press:async()=>{entries.push({startedDateTime:String(entries.length),request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doSpin&c=0.1&l=20'}},response:{status:200,content:{text:'na=s'}}});return {ok:true};}}});
 assert.equal(await s.verifyBase({rounds:1}),true);assert.equal(entries.length,2);
});
