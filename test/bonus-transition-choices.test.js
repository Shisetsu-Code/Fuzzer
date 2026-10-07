import test from 'node:test';
import assert from 'node:assert/strict';
import {knownControlKind} from '../providers/pragmatic/known-controls.js';
import {finishOperation,visibleOperationChoices} from '../providers/pragmatic/operation-completion.js';

const drawing=(name,path,event)=>({name,path,enabled:true,labels:[],hit_rect:{x:10,y:10,width:20,height:20},handlers:[{kind:'XTButton',event}]});
const stop=drawing('StopSpin_Button','GameRoot/UI Root/XTRoot/Root/GUI/Interface/TopBar/RightGroup/SpinButtons/StopSpin_Button','Evt_DataToCode_Pressed_Stop');
const option=name=>drawing(name,'Game/Bonus/'+name,'Evt_UnnamedChoice');

test('advertised base Stop is a continuation control, never a discovered bonus choice',()=>{
 assert.equal(knownControlKind(stop),'stop');
 assert.deepEqual(visibleOperationChoices([], [stop],{fallback:true}),[]);
 assert.deepEqual(visibleOperationChoices([], [stop,option('Left'),option('Right')],{fallback:true}).map(c=>c.path),['Game/Bonus/Left','Game/Bonus/Right']);
});

test('base Stop aliases are filtered without hiding feature-context choices',()=>{
 assert.equal(knownControlKind(drawing('Collider','GUI/SpinButtons/Collider','Evt_DataToCode_Pressed_Stop')),'stop');
 assert.equal(knownControlKind(drawing('StopSpin_Button','GUI/VisibleInSpecialFeature/SpinButtons/StopSpin_Button',null)),'stop');
 assert.equal(knownControlKind(drawing('StopSpin_Button','Game/Bonus/StopOrContinue',null)),null);
});

test('a server choice announced before its panel appears does not turn Stop into a decision',async()=>{
 let time=0,phase='intro',centers=0;
 const selected=[];
 const snapshot=()=>{if(phase==='intro'&&time>=5000)phase='choice';return {key:phase,controls:[],capture:{pending:false,uncertain:false},traffic:1,wager:{menuOpen:false},
  flags:{canSpin:phase==='done',stopActive:phase==='intro',mustOpenBonus:phase!=='done',stages:['StageResult']},
  operation:{sequence:1,protocolSequence:phase==='done'?2:1,kind:'purchase',transaction:{kind:'purchase',complete:true,status:200},protocolComplete:true,nextAction:phase==='done'?'s':'b'},
  choices:visibleOperationChoices([],phase==='intro'?[stop]:phase==='choice'?[option('Left'),option('Right')]:[],{fallback:true})};};
 const a={now:()=>time,sleep:async ms=>{time+=ms},snapshot:async()=>snapshot(),advance:async()=>({ok:true,kind:'WAIT'}),
  clickCenter:async()=>{centers++;return {ok:true};},
  choose:async c=>{selected.push(c.path);if(phase!=='choice')return {ok:false};phase='done';return {ok:true};}};
 const result=await finishOperation(a,{operation:{sequence:0}},snapshot(),{verifyPurchase:false,timeoutMs:30000,stallMs:15000});
 assert.equal(result.ok,true);assert.equal(centers,0);assert.deepEqual(selected,['Game/Bonus/Left']);
 assert.equal(result.decisions.length,1);assert.deepEqual(result.decisions[0].options.map(o=>o.key),['drawn:Game/Bonus/Left','drawn:Game/Bonus/Right']);
});


test('a server-advertised choice frontier may appear after the generic stall window and is still traversed',async()=>{
 let time=0,selected=[];
 const snapshot=()=>{
  const phase=time<20000?'intro':selected.length?'done':'choice';
  return {key:phase,controls:[],capture:{pending:false,uncertain:false},traffic:1,wager:{menuOpen:false},
   flags:{canSpin:phase==='done',stopActive:phase==='intro',mustOpenBonus:phase!=='done',stages:phase==='intro'?['StageResult']:[]},
   operation:{sequence:1,protocolSequence:phase==='done'?2:1,kind:'purchase',transaction:{kind:'purchase',complete:true,status:200},protocolComplete:true,nextAction:phase==='done'?'s':'b'},
   choices:phase==='choice'?visibleOperationChoices([], [option('Left'),option('Right')],{fallback:true}):[]};
 };
 const a={now:()=>time,sleep:async ms=>{time+=ms},snapshot:async()=>snapshot(),advance:async()=>({ok:true,kind:'WAIT'}),clickCenter:async()=>({ok:true}),
  choose:async c=>{selected.push(c.path);return {ok:true};}};
 const r=await finishOperation(a,{operation:{sequence:0}},snapshot(),{verifyPurchase:false,timeoutMs:60000,stallMs:15000});
 assert.equal(r.ok,true);assert(time>=20000);assert.deepEqual(selected,['Game/Bonus/Left']);
 assert.deepEqual(r.decisions[0].options.map(o=>o.key),['drawn:Game/Bonus/Left','drawn:Game/Bonus/Right']);
});


test('a late bonus panel must remain stable for four seconds before its first choice is clicked',async()=>{
 let time=0,selectedAt=null,done=false;
 const snapshot=()=>({key:done?'done':time<20000?'intro':'choice',controls:[],capture:{pending:false,uncertain:false},traffic:1,wager:{menuOpen:false},
  flags:{canSpin:done,stopActive:!done&&time<20000,mustOpenBonus:!done,stages:time<20000?['StageResult']:[]},
  operation:{sequence:1,protocolSequence:done?2:1,kind:'purchase',transaction:{kind:'purchase',complete:true,status:200},protocolComplete:true,nextAction:done?'s':'b'},
  choices:!done&&time>=20000?visibleOperationChoices([], [option('Left'),option('Right')],{fallback:true}):[]});
 const a={now:()=>time,sleep:async ms=>{time+=ms},snapshot:async()=>snapshot(),advance:async()=>({ok:true,kind:'WAIT'}),clickCenter:async()=>({ok:true}),
  choose:async()=>{selectedAt=time;done=true;return {ok:true};}};
 const result=await finishOperation(a,{operation:{sequence:0}},snapshot(),{verifyPurchase:false,timeoutMs:60000,stallMs:15000,choiceDwellMs:4000});
 assert.equal(result.ok,true);assert(selectedAt>=24000,`choice clicked too early at ${selectedAt}ms`);assert.equal(result.decisions[0].options.length,2);
});

test('an advertised choice suppresses Stop and center recovery while its panel is animating in',async()=>{
 let time=0,advances=0,centers=0;
 const snapshot=()=>({key:'intro',controls:[],capture:{pending:false,uncertain:false},traffic:1,wager:{menuOpen:false},
  flags:{canSpin:false,stopActive:true,mustOpenBonus:true,stages:['StageSpin']},
  operation:{sequence:1,protocolSequence:1,kind:'purchase',transaction:{kind:'purchase',complete:true,status:200},protocolComplete:true,nextAction:'b'},choices:[]});
 const a={now:()=>time,sleep:async ms=>{time+=ms},snapshot:async()=>snapshot(),advance:async()=>{advances++;return {ok:true,kind:'WAIT'}},clickCenter:async()=>{centers++;return {ok:true}}};
 const result=await finishOperation(a,{operation:{sequence:0}},snapshot(),{verifyPurchase:false,timeoutMs:6000,stallMs:15000,choiceDwellMs:4000});
 assert.equal(result.ok,false);assert.equal(result.reason,'OPERATION_TIMEOUT');assert.equal(advances,0);assert.equal(centers,0);
});
