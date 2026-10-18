import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveBonusBranch} from '../providers/pragmatic/live-bonus-branch.js';

function fixture(){
 let stage='picking',sequence=1,clicks=[],spins=0,chosen=[];
 let initialTransaction={kind:'purchase',complete:true,status:200};
 const before={key:'base',controls:[],operation:{sequence:0}};
 const capture=()=>({
  key:stage,
  operation:{sequence,transaction:sequence===1?initialTransaction:{kind:'spin',status:200,complete:true},
   protocolComplete:true,nextAction:'s',cascadeActive:false},
  choices:stage==='picking'?[{key:'A',name:'Prize A',event:'pick'},{key:'B',name:'Prize B',event:'pick'}]:[],
  controls:[],evidence:{tab_id:7,full_path:'fixture.jpg'},
  flags:{canSpin:stage!=='picking',logicIsFreeSpin:stage==='picking',
   respinInProgress:false,spinBlockingFeatureIsRunning:false,stopActive:false,
   lastWinIsCounting:false,waitInResultForBigWin:false,stages:[]},
  wager:{menuOpen:false}
 });
 const session={
  snapshot:async()=>capture(),
  choose:async choice=>{chosen.push(choice.key);stage='base';return {ok:true};},
  click:async c=>{clicks.push(c.key);return {ok:true};},
  advance:async()=>({ok:false,reason:'NO_CONTINUATION'}),
  clickCenter:async()=>{clicks.push('center');return {ok:true};},
  spinNormal:async()=>{spins++;sequence++;stage='base-verified';return {ok:true};}
 };
 return {before,initial:capture(),session,
  metrics:()=>({stage,sequence,clicks,spins,chosen}),
  setStage:s=>{stage=s;},
  setTransaction:t=>{initialTransaction=t;}
 };
}

test('picks are not chosen without explicit model action',async()=>{
 const f=fixture(),records=[];
 const b=createLiveBonusBranch(f.session,{before:f.before,initial:f.initial,onRecord:async x=>records.push(x)});
 const view=await b.observe();
 assert.equal(view.status,'CHOICE_REQUIRED');assert.equal(view.possibleActions.length,2);
 assert.equal(f.metrics().chosen.length,0);
 assert.equal((await b.act({token:'stale',action_id:'pick:A'})).status,'STALE_DECISION');
 assert.equal(f.metrics().chosen.length,0);
 const result=await b.act({token:view.token,action_id:'pick:B',reason:'Selected observed bonus choice'});
 assert.equal(result.status,'EXECUTED');assert.deepEqual(f.metrics().chosen,['B']);
 assert.equal(records.length,1);assert.equal(records[0].history[0].reason,'Selected observed bonus choice');
 assert.equal((await b.act({token:view.token,action_id:'pick:A'})).status,'STALE_DECISION');
});
test('purchase requires confirmed ack, explicit verification spin and two stable post-spin reads',async()=>{
 const f=fixture(),b=createLiveBonusBranch(f.session,{before:f.before,initial:f.initial});
 let s=await b.observe();assert.equal(s.purchaseAcknowledged,true);
 await b.act({token:s.token,action_id:'pick:A'});
 s=await b.observe();
 assert.equal(s.status,'READY_FOR_VERIFICATION');
 assert(s.possibleActions.some(x=>x.action_id==='verify_normal_spin'));
 assert.equal(f.metrics().spins,0);
 const step=await b.act({token:s.token,action_id:'verify_normal_spin'});
 assert.equal(step.status,'EXECUTED');assert.equal(f.metrics().spins,1);
 assert.equal(step.view.status,'VERIFYING_NORMAL_SPIN','first post-spin snapshot is not enough');
 s=await b.observe();
 assert.equal(s.status,'COMPLETE','second separate post-spin snapshot certifies return');
 assert.equal(b.peek().verified,true);
 assert.equal(s.possibleActions.length,0);
});
test('missing purchase server ack never exposes a verification spin',async()=>{
 const f=fixture();
 f.setTransaction({kind:'purchase',status:0,complete:false});
 const b=createLiveBonusBranch(f.session,{before:f.before,initial:f.initial});
 let s=await b.observe();
 assert.equal(s.status,'WAITING_FOR_PURCHASE_ACK');
 assert.equal(s.possibleActions.some(x=>x.action_id==='verify_normal_spin'),false);
 f.setStage('base');
 s=await b.observe();s=await b.observe();
 assert.equal(s.status,'WAITING_FOR_PURCHASE_ACK');assert.equal(f.metrics().spins,0);
});
test('if live state mutates after observation the chosen action does not click',async()=>{
 const f=fixture(),b=createLiveBonusBranch(f.session,{before:f.before,initial:f.initial});
 const s=await b.observe();f.setStage('base');
 const r=await b.act({token:s.token,action_id:'pick:A'});
 assert.equal(r.status,'STATE_CHANGED');assert.equal(r.clicked,false);
 assert.deepEqual(f.metrics().chosen,[]);
});
test('explicit close of an incomplete branch never fabricates completion',async()=>{
 const f=fixture(),b=createLiveBonusBranch(f.session,{before:f.before,initial:f.initial});
 await b.observe();
 const summary=b.close();
 assert.equal(summary.status,'CLOSED');
 assert.equal(summary.verified,false);
 await assert.rejects(()=>b.observe(),/UNAVAILABLE/);
});

test('StopSpin is a distinct approved control and cannot repeat within a single server spin',async()=>{
 let sequence=1,clicks=0;
 const before={key:'base',operation:{sequence:0}};
 const capture=()=>({key:'bonus-spin-'+sequence,
  operation:{sequence,transaction:{kind:'purchase',status:200,complete:true},
   protocolComplete:true,nextAction:'s'},
  controls:[{key:'Game/StopSpin_Button/Collider',
   fingerprint:'stop-fp',handlers:[{event:'Evt_DataToCode_Pressed_Stop'}]}],
  flags:{logicIsFreeSpin:true,stopActive:true,canSpin:false},
  choices:[],wager:{menuOpen:false},evidence:{tab_id:11}});
 const session={snapshot:async()=>capture(),click:async()=>{clicks++;return {ok:true};}};
 const b=createLiveBonusBranch(session,{before,initial:capture()});
 let s=await b.observe();
 const stop=s.possibleActions.find(a=>a.kind==='stop');
 assert(stop,'approved native STOP must be discoverable');
 assert.equal(clicks,0);
 const outcome=await b.act({token:s.token,action_id:stop.action_id,reason:'Stop the visible spin animation'});
 assert.equal(outcome.status,'EXECUTED');assert.equal(clicks,1);
 s=await b.observe();
 assert.equal(s.possibleActions.filter(a=>a.kind==='stop').length,0);
 sequence++;
 s=await b.observe();
 assert.equal(s.possibleActions.filter(a=>a.kind==='stop').length,1);
 await b.act({token:s.token,action_id:s.possibleActions.find(a=>a.kind==='stop').action_id});
 assert.equal(clicks,2);
 assert.deepEqual(b.peek().stoppedSpinSequences,[1,2]);
});
