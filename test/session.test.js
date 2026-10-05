import test from 'node:test';import assert from 'node:assert/strict';
import {assertDemoUrl,parseInit,PragmaticSession} from '../providers/pragmatic/session.js';
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
