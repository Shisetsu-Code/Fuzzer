import test from 'node:test';import assert from 'node:assert/strict';
import {assertDemoUrl,parseInit,PragmaticSession} from '../providers/pragmatic/session.js';
test('a ready base result with server collect pending verifies its one closing spin through the game',async()=>{
 const s=new PragmaticSession({entries:async()=>[],provider:{protocolState:async()=>({canSpin:true,logicIsFreeSpin:false,spinBlockingFeatureIsRunning:false,stages:[{name:'StageResult'}]}),continueProtocol:async()=>assert.fail('inactive free-spin collect must not be triggered')}});
 s.started=true;s.purchaseMenu=async()=>({open:false});s.latestExchange=async()=>({na:'c',fs_total:'20'});let rounds=0;s.verifyBase=async options=>{rounds=options.rounds;return true;};
 const result=await s.perform({kind:'continue'});assert.equal(result.ok,true);assert.equal(result.normalRoundsVerified,true);assert.equal(rounds,1);assert.equal(s.pendingVerified,true);
});
test('preparation finishes a naturally triggered feature before verifying fresh normal rounds',async()=>{
 let checks=0,finished=0;
 const s=new PragmaticSession({provider:{waitReady:async()=>({ok:true}),protocolState:async()=>({logicIsFreeSpin:true})}});
 s.syncInit=async()=>{s.initial={count:0};};s.verifyBase=async()=>++checks>1;s.finishIncidentalFeature=async()=>{finished++;return true;};
 await s.prepare();assert.equal(checks,2);assert.equal(finished,1);
});
test('incidental feature preparation selects the advertised choice and never starts a purchase',async()=>{
 const choice={id:'pick:0',kind:'pick'};let picked=false;const s=new PragmaticSession({});
 s.observe=async()=>picked?{terminal:true,options:[{id:'buy:0',kind:'buy'}]}:{terminal:false,options:[choice]};
 s.perform=async action=>{assert.equal(action.kind,'pick');picked=true;return {ok:true};};s.waitForTransition=async()=>true;
 assert.equal(await s.finishIncidentalFeature(),true);assert.equal(s.started,false);assert.equal(s.preparationBonus.steps.length,1);
});
test('base verification finishes an active stop control before requesting ordinary spins',async()=>{
 const list=[{startedDateTime:'init',request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doInit'}},response:{status:200,content:{text:'na=s'}}}];const actions=[];let stopActive=true;
 const s=new PragmaticSession({entries:async()=>list,provider:{protocolState:async()=>({canSpin:true,stopActive}),press:async(_frame,action)=>{actions.push(action);if(action==='stop')stopActive=false;else if(!stopActive)list.push({startedDateTime:String(list.length),request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doSpin&index='+list.length}},response:{status:200,content:{text:'na=s'}}});return {ok:true};}}});
 s.latestExchange=async()=>({na:'s'});
 assert.equal(await s.verifyBase(),true);assert.deepEqual(actions,['stop','spin','spin']);
});
test('result dismissal retries spaced clicks until base and stops before a fourth click',async()=>{
 let clicks=0;const state={canSpin:true,logicIsFreeSpin:false,spinBlockingFeatureIsRunning:true,stages:[{name:'StageResult'}]};
 const s=new PragmaticSession({entries:async()=>[],clickContinue:async()=>{clicks++;if(clicks===3)state.spinBlockingFeatureIsRunning=false;return {ok:true};},provider:{protocolState:async()=>state}});s.started=true;s.latestExchange=async()=>({na:'s'});s.latestRequest=async()=>({action:'doCollect'});s.purchaseMenu=async()=>({open:false});
 const before={state:structuredClone(state)};await s.perform({kind:'result_click'});assert.equal(await s.waitForTransition(before,{deadline:Date.now()+7000}),true);assert.equal(clicks,3);
});
test('result dismissal stops retries when a picker appears',async()=>{
 let clicks=0;const state={canSpin:true,spinBlockingFeatureIsRunning:true,stages:[{name:'StageResult'}]};const s=new PragmaticSession({entries:async()=>[],clickContinue:async()=>{clicks++;state.pickerControls=[{active:true}];return {ok:true};},provider:{protocolState:async()=>state}});s.started=true;s.latestExchange=async()=>({na:'s'});s.latestRequest=async()=>({action:'doCollect'});s.purchaseMenu=async()=>({open:false});await s.perform({kind:'result_click'});assert.equal(await s.waitForTransition({state},{deadline:Date.now()+1000}),true);assert.equal(clicks,1);
});
test('a proven collected free-spin result prefers a physical click over an internal event',async()=>{
 let clicks=0;const events=[];globalThis.Vars={ReceivedFreeSpinsResponse:'fs',Logic_IsFreeSpin:'logic',Evt_DataToCode_FreeSpinsWindowWinCollectPressed:'close'};
 globalThis.XT={GetObject:()=>({IsLastFreeSpin:true,TotalWin:1}),GetBool:()=>true,TriggerEvent:e=>events.push(e),variablesEvent:{close:[{OnValueChanged:[{object:{constructor:{name:'StageResultFreeSpin'}}}]}]}};
 try{const s=new PragmaticSession({frame:{evaluate:async(fn,arg)=>fn(arg)},entries:async()=>[],clickContinue:async()=>{clicks++;return {ok:true};},provider:{protocolState:async()=>({pickerControls:[]})}});s.latestRequest=async()=>({action:'doCollect'});s.latestExchange=async()=>({na:'s'});s.purchaseMenu=async()=>({open:false});assert.equal((await s.perform({kind:'runtime_finish'})).kind,'physical-result-continue');assert.equal(clicks,1);assert.deepEqual(events,[]);}
 finally{delete globalThis.Vars;delete globalThis.XT;}
});
test('a collected bonus blocked in the result stage receives one physical continue click',async()=>{
 let clicked=0;const state={canSpin:true,logicIsFreeSpin:false,spinBlockingFeatureIsRunning:true,stages:[{name:'StageResult'}]};
 const s=new PragmaticSession({entries:async()=>[],clickContinue:async()=>{clicked++;return {ok:true};},provider:{protocolState:async()=>state}});s.started=true;s.syncInit=async()=>{};s.latestExchange=async()=>({na:'s'});s.latestRequest=async()=>({action:'doCollect'});s.purchaseMenu=async()=>({open:false});
 const o=await s.observe();assert.equal(o.continueAction.kind,'result_click');assert.equal((await s.perform(o.continueAction)).ok,true);assert.equal(clicked,1);
 state.pickerControls=[{active:true,name:'Choice'}];assert.equal((await s.perform(o.continueAction)).ok,false);assert.equal(clicked,1);
});
test('normal verification waits through a transient ready flag until the cascade is collected',async()=>{
 const list=[];let spins=0,readyChecks=0;
 const entry=(action,text)=>({startedDateTime:String(list.length),request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action='+action+'&index='+list.length}},response:{status:200,content:{text}}});
 const s=new PragmaticSession({entries:async()=>list,provider:{press:async()=>{spins++;readyChecks=0;list.push(entry('doSpin','na=s&rs_c=1'));return {ok:true};},protocolState:async()=>{if(++readyChecks===3){list.push(entry('doSpin','na=c&rs_t=1'));list.push(entry('doCollect','na=s'));}return {canSpin:true};}}});
 assert.equal(await s.verifyBase(),true);assert.equal(spins,2);
});
test('a response with an active cascade cannot certify a normal round despite a ready runtime flag',async()=>{
 let count=0;
 const list=[{startedDateTime:'0',request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doInit'}},response:{status:200,content:{text:'na=s'}}}];
 const s=new PragmaticSession({entries:async()=>list,provider:{protocolState:async()=>({canSpin:true}),press:async()=>{count++;list.push({startedDateTime:String(count),request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doSpin&index='+(count+1)}},response:{status:200,content:{text:'na=s&rs_c=,1&rs_m=,1'}}});return {ok:true};}}});
 assert.equal(await s.verifyBase(),false);assert.equal((await s.latestExchange()).rs_c,',1');
});
test('an active server cascade blocks base discovery even when the client briefly reports canSpin',async()=>{
 const s=new PragmaticSession({entries:async()=>[{request:{url:'https://demogamesfree.pragmaticplay.net/gameService'},response:{status:200,content:{text:'na=s&rs_c=1&rs_m=1'}}}],provider:{protocolState:async()=>({canSpin:true})}});s.started=true;s.purchaseMenu=async()=>({open:false});
 assert.equal((await s.observe()).terminal,false);
});
test('a visible picker cannot bypass an unfinished spin stage',async()=>{
 const s=new PragmaticSession({entries:async()=>[],provider:{protocolState:async()=>({stages:[{name:'StageSpin'}],pickerControls:[{active:true,name:'Pick'}]})}});s.started=true;
 const state=await s.observe();assert.deepEqual(state.options,[]);assert.equal(state.continueAction.kind,'continue');
});
test('an old ante spin and a new collect response do not verify another normal round',async()=>{
 const old={startedDateTime:'2026-10-04T00:00:00Z',request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doSpin&bl=1'}},response:{status:200,content:{text:'na=s'}}};
 const collect={startedDateTime:'2026-10-04T00:00:01Z',request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doCollect'}},response:{status:200,content:{text:'na=s'}}};
 let list=[old];const s=new PragmaticSession({entries:async()=>list,provider:{protocolState:async()=>({canSpin:true}),press:async()=>{list=[old,collect];return {ok:true};}}});
 assert.equal(await s.verifyBase({expectedBetLevel:1}),false);
});
test('ante verification requires two newly completed normal requests with the selected level',async()=>{
 const list=[{startedDateTime:'2026-10-04T00:00:00Z',request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doInit'}},response:{status:200,content:{text:'na=s'}}}];let count=0;
 const s=new PragmaticSession({entries:async()=>list,provider:{protocolState:async()=>({canSpin:true}),press:async()=>{count++;list.push({startedDateTime:'2026-10-04T00:00:0'+count+'Z',request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doSpin&bl=2&index='+count}},response:{status:200,content:{text:'na=s&index='+count}}});return {ok:true};}}});
 assert.equal(await s.verifyBase({expectedBetLevel:2}),true);assert.equal(count,2);
});
test('a normal ante round may end with collect after its winning spin',async()=>{
 let count=0;const list=[{startedDateTime:'0',request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doInit'}},response:{status:200,content:{text:'na=s'}}}];
 const s=new PragmaticSession({entries:async()=>list,provider:{protocolState:async()=>({canSpin:true}),press:async()=>{count++;for(const [action,text] of [['doSpin','na=c'],['doCollect','na=s']])list.push({startedDateTime:String(count)+action,request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action='+action+(action==='doSpin'?'&bl=1':'')+'&index='+count}},response:{status:200,content:{text}}});return {ok:true};}}});
 assert.equal(await s.verifyBase({expectedBetLevel:1}),true);assert.equal(count,2);
});
test('a final free-spin response with fs_total cannot count as a normal ante round',async()=>{
 const list=[{startedDateTime:'0',request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doInit'}},response:{status:200,content:{text:'na=s'}}}];let count=0;
 const s=new PragmaticSession({entries:async()=>list,provider:{protocolState:async()=>({canSpin:true}),press:async()=>{count++;for(const [action,text] of [['doSpin','na=c&fs_total=14'],['doCollect','na=s']])list.push({startedDateTime:String(count)+action,request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action='+action+(action==='doSpin'?'&bl=1':'')+'&index='+count}},response:{status:200,content:{text}}});return {ok:true};}}});
 assert.equal((await s.latestExchange()).na,'s');
 assert.equal(await s.verifyBase({expectedBetLevel:1}),false);
 assert.equal((await s.capture('read',0)).exchanges.find(e=>e.request.action==='doSpin').response.fs_total,'14');
});
test('closing an already collected free spin result requires the active stage handler',async()=>{
 const events=[];const fs={IsFreeSpinsCollected:false,IsLastFreeSpin:true,TotalWin:1};
 globalThis.Vars={ReceivedFreeSpinsResponse:'fs',Logic_IsFreeSpin:'logic',Evt_DataToCode_FreeSpinsWindowWinCollectPressed:'close'};
 globalThis.XT={GetObject:()=>fs,GetBool:()=>true,TriggerEvent:e=>events.push(e),variablesEvent:{close:[{OnValueChanged:[{isEnabled:true,object:{constructor:{name:'StageResultFreeSpin'}}}]}]}};
 try{const s=new PragmaticSession({frame:{evaluate:async(fn,arg)=>fn(arg)},entries:async()=>[]});s.latestRequest=async()=>({action:'doCollect'});s.latestExchange=async()=>({na:'s'});assert.equal((await s.perform({kind:'runtime_finish'})).ok,true);assert.deepEqual(events,['close']);fs.IsLastFreeSpin=false;assert.equal((await s.perform({kind:'runtime_finish'})).ok,false);assert.deepEqual(events,['close']);}
 finally{delete globalThis.Vars;delete globalThis.XT;}
});
test('a collected bonus can reset its free spin object while the result stage still needs closing',async()=>{
 const events=[],fs={IsFreeSpin:false,CurrentSpin:0,MaxSpins:0,TotalWin:0},handler={isEnabled:true,object:{constructor:{name:'StageResultFreeSpin'},xtEnabled:true}};
 globalThis.Vars={ReceivedFreeSpinsResponse:'fs',Logic_IsFreeSpin:'logic',SpinCycleWinReceived:'win',Evt_DataToCode_FreeSpinsWindowWinCollectPressed:'close'};
 globalThis.XT={GetObject:()=>fs,GetBool:()=>true,GetDouble:()=>100,TriggerEvent:e=>events.push(e),variablesEvent:{close:[{OnValueChanged:[handler]}]}};
 try{
  const s=new PragmaticSession({entries:async()=>[],frame:{evaluate:async(fn,arg)=>fn(arg)},provider:{protocolState:async()=>({logicIsFreeSpin:true,stages:[{name:'StageResultFreeSpin'}],freeSpins:{inactive:true,current:0,max:0}})}});s.started=true;s.latestRequest=async()=>({action:'doCollect'});s.latestExchange=async()=>({na:'s'});
  assert.equal((await s.observe()).continueAction.kind,'runtime_finish');assert.equal((await s.perform({kind:'runtime_finish'})).ok,true);assert.deepEqual(events,['close']);
  handler.object.xtEnabled=false;assert.equal((await s.perform({kind:'runtime_finish'})).ok,false);assert.deepEqual(events,['close']);
 }finally{delete globalThis.Vars;delete globalThis.XT;}
});
test('reads the real non JSON purInit grammar without executing code',()=>{
 const init=parseInit('sc=0.1&purInit='+encodeURIComponent('[{bet:2000,type:"default"},{bet:10000,type:"default"}]'));
 assert.equal(init.count,2);assert.equal(init.options[0].bet,2000);
 assert.equal(parseInit('sc=0.1&purInit=evil()'),null);
});
test('distinguishes confirmed empty init from a missing response',()=>{
 assert.equal(parseInit('sc=0.1').count,0);assert.equal(parseInit('balance=50'),null);
});
test('rejects real money hosts and misleading demo query strings',()=>{
 assert.throws(()=>assertDemoUrl('https://casino.example/?demo=true'));
 assert.throws(()=>assertDemoUrl('https://demogamesfree.pragmaticplay.net.evil.test/'));
 assertDemoUrl('https://www.pragmaticplay.com/en/games/gates-of-olympus/');
});
test('contracts exclude session parameters and query credentials',async()=>{
 const s=new PragmaticSession({entries:async()=>[{request:{url:'https://demogamesfree.pragmaticplay.net/gs2c/gameService?token=SECRET',postData:{text:'action=doSpin&c=1&l=20&mgckey=SECRET'}},response:{status:200,content:{text:'na=s&balance=500&session=SECRET'}}}]});
 assert.ok(!JSON.stringify(await s.capture('read',0)).includes('SECRET'));
});
test('submits the spin required by a selected purchase',async()=>{
 const calls=[];const s=new PragmaticSession({entries:async()=>[],provider:{purchase:async()=>({ok:true,needsSpin:true}),press:async(f,a)=>{calls.push(a);return {ok:true};}}});
 s.initial={count:1};await s.perform({kind:'buy',index:0});assert.deepEqual(calls,['spin']);
});
test('decodes base64 continuation fields',async()=>{
 const s=new PragmaticSession({entries:async()=>[{request:{url:'https://demogamesfree.pragmaticplay.net/gameService'},response:{status:200,content:{encoding:'base64',text:Buffer.from('na=s&rs=mc&trail=abc').toString('base64')}}}]});
 assert.equal((await s.latestExchange()).rs,'mc');assert.equal((await s.capture('read',0)).exchanges[0].response.trail,'abc');
});
test('a wait-only continuation can proceed when an actual confirmation becomes actionable',async()=>{
 const s=new PragmaticSession({entries:async()=>[],provider:{protocolState:async()=>({canSpin:false,confirmFSActive:true})}});
 s.pendingKind='continue';s.waitingOnly=true;
 assert.equal(await s.waitForTransition({state:{canSpin:false,confirmFSActive:false}},{deadline:Date.now()+500}),true);
});
test('antebet declared by runtime remains pending when no control is exposed',async()=>{
 const s=new PragmaticSession({entries:async()=>[{request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doInit'}},response:{status:200,content:{text:'sc=0.1&na=s'}}}],
 frame:{evaluate:async()=>({has:true,disabled:false,events:[]})},provider:{protocolState:async()=>({canSpin:true}),listEconomicPurchases:async()=>[]}});
 assert.equal((await s.observe()).options[0].id,'ante_bet:unresolved');
});
test('a stale response and unrelated animation do not authorize another server action',async()=>{
 const s=new PragmaticSession({entries:async()=>[],provider:{protocolState:async()=>({canSpin:false,stopActive:true})}});
 s.pendingKind='continue';s.waitingOnly=false;
 assert.equal(await s.waitForTransition({state:{canSpin:false}},{deadline:Date.now()+250}),false);
});
test('an accepted increase at the maximum never decreases the original stake',async()=>{
 const calls=[];const s=new PragmaticSession({provider:{press:async(f,a)=>{calls.push(a);return {ok:true};}}});
 s.economics=async()=>({bet:10,variables:{},options:[]});
 const probe=await s.probeBet();assert.equal(probe.status,'PENDING');assert.equal(probe.restored,true);assert.deepEqual(calls,['bet_increase']);
});
test('restoration is verified from a fresh final runtime read rather than the baseline snapshot',async()=>{
 let reads=0;const s=new PragmaticSession({provider:{press:async()=>({ok:true})}});
 s.economics=async()=>({bet:++reads===5?11:10,variables:{},options:[]});
 const probe=await s.probeBet();assert.equal(probe.restored,false);assert.equal(probe.finalBet,11);
});
test('collect waits for the real final feature control instead of invoking an inactive event',async()=>{
 const s=new PragmaticSession({entries:async()=>[],provider:{protocolState:async()=>({logicIsFreeSpin:true}),continueProtocol:async()=>{throw new Error('Inactive collect must not be invoked');}}});
 s.latestExchange=async()=>({na:'c'});const result=await s.perform({kind:'continue'});assert.equal(result.kind,'collect-ui-wait');assert.equal(result.waiting,true);
});
test('pressing the final control clears the preceding UI wait before checking its transition',async()=>{
 const s=new PragmaticSession({entries:async()=>[],provider:{pressProtocolChoice:async()=>({ok:true})}});s.awaitingFinish=true;
 await s.perform({kind:'finish',control:{index:1}});assert.equal(s.awaitingFinish,false);
});
test('discovers every active purchase in a later menu rather than discarding it after started',async()=>{
 const s=new PragmaticSession({entries:async()=>[],provider:{protocolState:async()=>({canSpin:true,pickerControls:[]})}});s.started=true;
 s.purchaseMenu=async()=>({open:true,selected:0,options:Array.from({length:6},(_,index)=>({kind:'FeaturePurchaseOption',root:0,index,name:'Choice'+index,purchaseIndex:index}))});
 const observed=await s.observe();assert.equal(observed.phase,'purchase-menu');assert.equal(observed.terminal,false);assert.equal(observed.options.length,6);
});
