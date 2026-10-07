import test from 'node:test';
import assert from 'node:assert/strict';
import {finishOperation} from '../providers/pragmatic/operation-completion.js';

function fixture({reply='spin',stale=true,prompt=false,pending=false,newFeature=false}={}){
 let time=0,clickedAt=null,continued=false;
 const inputs=[];
 const snapshot=()=>{
  const replied=clickedAt!==null&&time-clickedAt>=1000;
  const received=replied&&reply==='spin';
  const transaction={kind:'purchase',status:200,complete:true};
  return {controls:[],choices:[],traffic:received?2:1,wager:{menuOpen:false},
   capture:{marker:received?'new':'old',pending,uncertain:false},
   exitSurface:{clear:!prompt||continued,reason:prompt&&!continued?'INTERACTION_REQUIRED':'CLEAR',key:prompt&&!continued?'overlay':'base'},
   flags:{canSpin:!stale,logicIsFreeSpin:stale||newFeature,stopActive:stale,stages:stale?['StageResultFreeSpin']:[]},
   operation:{sequence:received?2:1,protocolSequence:received?3:2,kind:received?'spin':'purchase',
    submission:{sequence:1,...transaction},transaction:received?{kind:'spin',status:200,complete:true}:transaction,
    verification:received?{sequence:2,kind:'spin',status:200,complete:true,payload:{action:'doSpin'}}:null,
    protocolComplete:true,nextAction:received&&newFeature?'b':'s',cascadeActive:stale}};
 };
 const adapter={now:()=>time,sleep:async ms=>{time+=ms;},snapshot:async()=>snapshot(),
  spinNormal:async(_s,options)=>{assert.equal(options?.empirical,true);inputs.push('spin');clickedAt=time;return {ok:true,clicked:true,sequenceBefore:1,protocolSequenceBefore:2,control:'base/spin',empirical:true};},
  advance:async()=>{if(prompt&&!continued){continued=true;inputs.push('continue');return {ok:true,clicked:true,kind:'OBSERVED_CONTINUE'};}return {ok:true,kind:'WAIT'};},
  clickCenter:async()=>{inputs.push('center');return {ok:true};}};
 return {inputs,get time(){return time;},get clickedAt(){return clickedAt;},run:()=>finishOperation(adapter,{operation:{sequence:0}},snapshot(),{
  verifyPurchase:false,probeIdleMs:4000,probeResponseMs:6000,stallMs:15000,timeoutMs:30000,recoveryQuietMs:4000,recoveryGapMs:4000})};
}

test('a real normal spin closes a quiet purchase despite stale feature and canSpin flags',async()=>{
 const f=fixture();const result=await f.run();
 assert.equal(result.ok,true);assert.equal(result.normalSpinVerified,true);
 assert.equal(result.closureEvidence.basis,'OBSERVED_NORMAL_SPIN');
 assert.equal(result.verification.sequence,2);assert.equal(f.inputs.filter(x=>x==='spin').length,1);
 assert.ok(f.clickedAt>=4000);assert.ok(f.time<15000);
});

test('an enabled-looking button alone cannot close a purchase without a completed new spin',async()=>{
 const f=fixture({stale:false,reply:'none'});const result=await f.run();
 assert.equal(result.ok,false);assert.equal(result.normalSpinVerified,false);
 assert.equal(f.inputs.filter(x=>x==='spin').length,1);
 assert.equal(result.reason,'EXIT_PROBE_NO_RESPONSE');
 assert.deepEqual(f.inputs,['spin']);
});

test('a visible interaction is continued before a single exit probe',async()=>{
 const f=fixture({prompt:true});const result=await f.run();
 assert.equal(result.ok,true);assert.deepEqual(f.inputs,['continue','spin']);
 assert.ok(f.clickedAt>=8000);
});

test('a verification spin that triggers another bonus still proves the previous one closed',async()=>{
 const f=fixture({newFeature:true});const result=await f.run();
 assert.equal(result.ok,true);assert.equal(result.closureEvidence.basis,'OBSERVED_NORMAL_SPIN');
 assert.equal(result.verificationNextOperation.nextAction,'b');
 assert.equal(result.verificationNextOperation.complete,false);
 assert.equal(f.inputs.filter(x=>x==='spin').length,1);
});

test('pending capture never authorizes the empirical exit input',async()=>{
 const f=fixture({pending:true});const result=await f.run();
 assert.equal(result.ok,false);assert.deepEqual(f.inputs,[]);
});

test('HTTP 200 carrying a rejected spin is not completion evidence',async()=>{
 let time=0,clicked=false;
 const snapshot=()=>({controls:[],choices:[],traffic:clicked?2:1,capture:{pending:false,uncertain:false,marker:clicked?'new':'old'},exitSurface:{clear:true,key:'base'},flags:{canSpin:false},wager:{menuOpen:false},
 operation:{sequence:clicked?2:1,protocolSequence:clicked?3:2,kind:'purchase',submission:{sequence:1,kind:'purchase',complete:true,status:200},transaction:{kind:'purchase',complete:true,status:200},protocolComplete:true,nextAction:'s',verification:clicked?{sequence:2,kind:'spin',complete:true,status:200,protocolAccepted:false}:null}});
 const a={now:()=>time,sleep:async ms=>{time+=ms;},snapshot:async()=>snapshot(),spinNormal:async()=>{clicked=true;return {ok:true,clicked:true,empirical:true,sequenceBefore:1,protocolSequenceBefore:2};}};
 const result=await finishOperation(a,{operation:{sequence:0}},snapshot(),{probeIdleMs:4000,timeoutMs:10000,verifyPurchase:false});
 assert.equal(result.ok,false);assert.equal(result.reason,'EXIT_PROBE_REJECTED');
});

test('a late unlabelled continuation is handled even behind stale StageSpin with na=s',async()=>{
 let time=0,continued=false,spun=false;const inputs=[];
 const snapshot=()=>({controls:[],choices:continued?[]:[{key:'new/continue'}],traffic:0,capture:{pending:false,uncertain:false,marker:'m'},exitSurface:{clear:continued,key:continued?'base':'prompt'},flags:{canSpin:false,stages:['StageSpin']},wager:{menuOpen:false},
 operation:{sequence:spun?2:1,protocolSequence:spun?3:2,submission:{sequence:1,kind:'purchase',complete:true,status:200},transaction:{kind:spun?'spin':'purchase',complete:true,status:200},kind:'purchase',protocolComplete:true,nextAction:'s',verification:spun?{sequence:2,kind:'spin',complete:true,status:200}:null}});
 const a={now:()=>time,sleep:async ms=>{time+=ms;},snapshot:async()=>snapshot(),choose:async()=>{continued=true;inputs.push('continue');return {ok:true};},spinNormal:async()=>{spun=true;inputs.push('spin');return {ok:true,clicked:true,empirical:true,sequenceBefore:1,protocolSequenceBefore:2};}};
 const result=await finishOperation(a,{operation:{sequence:0}},snapshot(),{probeIdleMs:4000,choiceDwellMs:4000,timeoutMs:20000,verifyPurchase:false});
 assert.equal(result.ok,true);assert.deepEqual(inputs,['continue','spin']);assert.equal(result.decisions[0].options[0].key,'new/continue');
});

test('transport success and accepted game response are distinct for the anchored verification',async()=>{
 const {operationStateFromEntries}=await import('../providers/pragmatic/operation-completion.js');
 const entry=text=>({request:{url:'https://demo.invalid/gameService',postData:{text:'action=doSpin'}},response:{status:200,content:{text}}});
 const bad=operationStateFromEntries([entry('error=8&na=s')],{verificationAfterSequence:0});
 assert.equal(bad.verification.complete,true);assert.equal(bad.verification.protocolAccepted,false);
 const good=operationStateFromEntries([entry('na=b&balance=100')],{verificationAfterSequence:0});
 assert.equal(good.verification.protocolAccepted,true);assert.equal(good.verification.responseNextAction,'b');
});

test('a response observed through an uncertain capture cannot certify the probe',async()=>{
 let time=0,clicked=false;
 const snapshot=()=>({controls:[],choices:[],traffic:clicked?2:1,capture:{pending:false,uncertain:clicked,marker:clicked?'new':'old'},exitSurface:{clear:true,key:'base'},flags:{canSpin:false},wager:{menuOpen:false},
 operation:{sequence:clicked?2:1,protocolSequence:clicked?3:2,kind:'purchase',submission:{sequence:1,kind:'purchase',complete:true,status:200},transaction:{kind:'purchase',complete:true,status:200},protocolComplete:true,nextAction:'s',verification:clicked?{sequence:2,kind:'spin',complete:true,status:200,protocolAccepted:true}:null}});
 const a={now:()=>time,sleep:async ms=>{time+=ms;},snapshot:async()=>snapshot(),spinNormal:async()=>{clicked=true;return {ok:true,clicked:true,empirical:true,sequenceBefore:1,protocolSequenceBefore:2};}};
 const result=await finishOperation(a,{operation:{sequence:0}},snapshot(),{probeIdleMs:4000,probeResponseMs:2000,timeoutMs:10000,verifyPurchase:false});
 assert.equal(result.ok,false);assert.equal(result.normalSpinVerified,false);
});

for(const reason of ['EXIT_PROBE_NO_RESPONSE','EXIT_PROBE_INTERACTION_REQUIRED','EXIT_PROBE_CLICK_UNCONFIRMED'])test(`${reason} retains the bounded clean-session retry policy`,async()=>{
 const {exploreStates}=await import('../providers/pragmatic/state-explorer.js');
 let time=0,resets=0,attempts=0;
 const s={key:'root',controls:[{key:'buy'}],choices:[],operation:{sequence:0},traffic:0};
 const a={now:()=>time,reset:async()=>{resets++;},snapshot:async()=>s,click:async()=>{attempts++;},operationStarted:()=>true,finishOperation:async()=>({ok:false,reason,kind:'purchase',decisions:[],snapshot:s})};
 const r=await exploreStates(a,{mode:'actions',maxActions:10,maxRetries:2,wait:async()=>({reason:'OPERATION_STARTED',snapshot:s})});
 assert.equal(attempts,3);assert.equal(resets,3);assert.equal(r.pending[0].reason,reason);assert.equal(r.pending[0].attempts,3);
});

test('a probe that reveals a prompt follows it and cannot use its continuation spin as exit proof',async()=>{
 let time=0,phase='base',probes=0,sequence=1;const inputs=[];
 const snapshot=()=>({controls:[],choices:phase==='prompt'?[{key:'choose-a'},{key:'choose-b'}]:[],traffic:sequence,capture:{pending:false,uncertain:false,marker:String(sequence)},exitSurface:{clear:phase!=='prompt',key:phase},flags:{canSpin:false},wager:{menuOpen:false},
 operation:{sequence,protocolSequence:sequence,kind:'purchase',submission:{sequence:1,kind:'purchase',complete:true,status:200},transaction:{kind:sequence>1?'spin':'purchase',complete:true,status:200},protocolComplete:true,nextAction:'s',verification:sequence>1?{sequence,kind:'spin',complete:true,status:200,protocolAccepted:true}:null}});
 const a={now:()=>time,sleep:async ms=>{time+=ms;},snapshot:async()=>snapshot(),choose:async c=>{inputs.push(c.key);phase='base';sequence=2;return {ok:true};},spinNormal:async()=>{const before=sequence;inputs.push('probe');if(++probes===1)phase='prompt';else sequence=3;return {ok:true,clicked:true,empirical:true,sequenceBefore:before,protocolSequenceBefore:before};}};
 const result=await finishOperation(a,{operation:{sequence:0}},snapshot(),{probeIdleMs:4000,probeResponseMs:6000,choiceDwellMs:4000,choicePlan:['choose-b'],timeoutMs:30000,verifyPurchase:false});
 assert.equal(result.ok,true);assert.equal(result.closureEvidence.sequence,3);
 assert.deepEqual(inputs,['probe','choose-b','probe']);assert.equal(result.decisions[0].options.length,2);
});
