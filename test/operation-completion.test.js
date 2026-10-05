import test from 'node:test';import assert from 'node:assert/strict';
import {finishOperation,operationStateFromEntries,visibleOperationChoices} from '../providers/pragmatic/operation-completion.js';
const entry=(action,status=200,text='na=s',extra='')=>({request:{url:'https://demogamesfree.pragmaticplay.net/gs2c/gameService?token=private',postData:{text:`action=${action}&c=0.1&l=20&${extra}`}},response:{status,content:{text}}});
test('submission uses game requests, not assets or random bonus state',()=>{
 const s=operationStateFromEntries([entry('doInit'),entry('doSpin',200,'na=s','pur=2&mgckey=private')]);
 assert.equal(s.sequence,1);assert.equal(s.kind,'purchase');assert.equal(s.transaction.payload.pur,'2');assert(!JSON.stringify(s).includes('private'));
 assert.equal(operationStateFromEntries([entry('doInit')]).sequence,0);
});
test('an active picker without a current visible drawing is not a choice',()=>{
 const pickers=[{root:1,index:2,name:'Collider',event:'pick',active:true}];
 assert.deepEqual(visibleOperationChoices(pickers,[]),[]);
 const drawing={root:1,path:'menu/option',hit_rect:{x:0,y:0,width:10,height:10},labels:['25 spins'],handlers:[{kind:'XTButton',index:2,event:'pick'}]};
 const choices=visibleOperationChoices(pickers,[drawing]);assert.equal(choices.length,1);assert.deepEqual(choices[0].labels,['25 spins']);
 assert.deepEqual(visibleOperationChoices(pickers,[{...drawing,root:2}]),[]);
});
test('a purchase waits out automatic spins, continues even with background controls, and verifies a normal spin',async()=>{
 let t=0,center=0,spin=0,finished=false,verified=false;
 const snap=()=>({key:`random-${t}`,controls:[{key:'background-buy'}],choices:[],flags:{stages:t<6000?['StageSpin']:[],canSpin:finished},wager:{menuOpen:false},traffic:t<6000?Math.floor(t/1000):6,operation:{sequence:verified?2:1,kind:verified?'spin':'purchase',transaction:{complete:true,status:200,kind:verified?'spin':'purchase'},protocolComplete:true,nextAction:'s'}});
 const a={now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>snap(),clickCenter:async()=>{center++;finished=true},advance:async()=>({ok:false}),spinNormal:async()=>{spin++;verified=true;return {ok:true}}};
 const r=await finishOperation(a,{operation:{sequence:0}},snap(),{timeoutMs:30000,pollMs:500});
 assert.equal(r.ok,true);assert.equal(r.normalSpinVerified,true);assert.equal(spin,1);assert(center>=1);assert(t>=6000);
});
test('internal choices are recorded as a family, independent of random state keys',async()=>{
 let t=0,selected=false,verified=false;
 const snap=()=>({key:`unrepeatable-${t}`,controls:[],choices:selected?[]:[{key:'first'},{key:'second'}],flags:{stages:[],canSpin:selected},wager:{menuOpen:false},traffic:0,operation:{sequence:verified?2:1,kind:verified?'spin':'purchase',transaction:{complete:true,status:200,kind:verified?'spin':'purchase'},protocolComplete:true,nextAction:'s'}});
 const a={now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>snap(),choose:async c=>{assert.equal(c.key,'second');selected=true;return {ok:true}},spinNormal:async()=>{verified=true;return {ok:true}}};
 const r=await finishOperation(a,{operation:{sequence:0}},snap(),{choicePlan:['second'],timeoutMs:30000});
 assert.equal(r.ok,true);assert.equal(r.decisions[0].selected,'second');assert.equal(r.decisions[0].options.length,2);assert.equal(r.decisions[0].parent,null);
});
test('a base-looking screen with an unfinished response is not a completed purchase',async()=>{
 let t=0,spins=0;const s={controls:[],choices:[],flags:{canSpin:true,stages:[]},wager:{menuOpen:false},traffic:0,operation:{sequence:1,kind:'purchase',transaction:{complete:false,status:0},protocolComplete:false,nextAction:'s'}};
 const a={now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>s,spinNormal:async()=>{spins++;return {ok:true}}};
 const r=await finishOperation(a,{operation:{sequence:0}},s,{timeoutMs:2000});assert.equal(r.ok,false);assert.equal(spins,0);assert.equal(r.reason,'OPERATION_TIMEOUT');
});
test('a continue overlay is clicked after five seconds even when StageSpin remains active',async()=>{
 let t=0,continued=false,verified=false,clickedAt=null;
 const snap=()=>({controls:[{key:'full-screen-continue'}],choices:[],flags:{stages:continued?[]:['StageSpin'],canSpin:continued},wager:{menuOpen:false},traffic:0,operation:{sequence:verified?2:1,kind:verified?'spin':'purchase',transaction:{complete:true,status:200,kind:verified?'spin':'purchase'},protocolComplete:true,nextAction:'s'}});
 const a={now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>snap(),clickCenter:async()=>{continued=true;clickedAt=t},spinNormal:async()=>{verified=true;return {ok:true}}};
 const r=await finishOperation(a,{operation:{sequence:0}},snap(),{timeoutMs:10000});assert.equal(r.ok,true);assert.equal(clickedAt,5000);
});
test('the same choice panel is selected once while its server acknowledgement arrives',async()=>{
 let t=0,clicks=0,verified=false;
 const snap=()=>({controls:[],choices:t<1500?[{key:'a'},{key:'b'}]:[],flags:{stages:[],canSpin:t>=1500},wager:{menuOpen:false},traffic:t<500?0:1,operation:{sequence:verified?2:1,protocolSequence:t<500?1:2,kind:verified?'spin':'purchase',transaction:{complete:true,status:200,kind:verified?'spin':'purchase'},protocolComplete:true,nextAction:'s'}});
 const a={now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>snap(),choose:async()=>{clicks++;return {ok:true}},spinNormal:async()=>{verified=true;return {ok:true}}};
 const r=await finishOperation(a,{operation:{sequence:0}},snap(),{timeoutMs:10000});assert.equal(r.ok,true);assert.equal(clicks,1);assert.equal(r.decisions.length,1);
});
