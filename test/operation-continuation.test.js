import test from 'node:test';
import assert from 'node:assert/strict';
import {finishOperation,operationStateFromEntries} from '../providers/pragmatic/operation-completion.js';

const entry=(extra='',status=200,text='na=s')=>({request:{url:'https://demo.invalid/gameService?token=private',postData:{text:`action=doSpin&c=0.1&l=20&${extra}`}},response:{status,content:{text}}});
function operationHarness(){
 const h={time:0,entries:[entry('pur=0')],flags:{canSpin:true,stages:[]},menuOpen:false,choices:[],boundary:null,attempts:0,centerTimes:[],advanceTimes:[],onTick:()=>{},onCenter:()=>({ok:true}),onAdvance:()=>({kind:'WAIT',ok:true}),onSpin:()=>{const sequenceBefore=h.entries.length;h.entries.push(entry());return {ok:true,clicked:true,sequenceBefore,control:'GUI/Spin'};}};
 h.snapshot=()=>({controls:[{key:'continuation'}],choices:h.choices,flags:h.flags,wager:{menuOpen:h.menuOpen,balance:100000,serverMarker:'private'},traffic:h.entries.length,operation:operationStateFromEntries(h.entries,{afterSequence:0,...(h.boundary===null?{}:{verificationAfterSequence:h.boundary})}),evidence:{tab_id:42,capture_id:'capture',full_path:'screen.jpg',artifact_dir:'evidence',raw:'private'}});
 h.adapter={now:()=>h.time,sleep:async ms=>{h.time+=ms;h.onTick();},snapshot:async()=>h.snapshot(),spinNormal:async()=>{h.attempts++;const before=h.entries.length,result=h.onSpin();if(result?.ok===true)h.boundary=result.sequenceBefore??before;return result;},clickCenter:async()=>{h.centerTimes.push(h.time);return h.onCenter();},advance:async()=>{h.advanceTimes.push(h.time);return h.onAdvance();},choose:async()=>{h.choices=[];return {ok:true};}};
 h.finish=(options={})=>finishOperation(h.adapter,{operation:{sequence:0}},h.snapshot(),{timeoutMs:10000,...options});
 return h;
}

// Returning immediately for a no-click failure must fail this regression.
test('normal-looking flags allow continuation recovery before exactly one verification spin',async()=>{
 const h=operationHarness();let continued=false;
 h.onSpin=()=>{if(!continued)return {ok:false,clicked:false,retryable:true,reason:'NO_OBSERVED_NORMAL_SPIN'};const sequenceBefore=h.entries.length;h.entries.push(entry());return {ok:true,clicked:true,sequenceBefore};};
 h.onCenter=()=>{continued=true;return {ok:true,reason:'INTRO_DISMISSED'};};
 const result=await h.finish();
 assert.equal(result.ok,true);assert.equal(result.kind,'purchase');assert.deepEqual(h.centerTimes,[5000]);assert.equal(h.entries.length,2);
 assert.equal(result.verification.sequence,2);assert.equal(result.verification.kind,'spin');assert.equal(result.submission.payload.pur,'0');
 assert.equal(result.continuations.find(c=>c.kind==='CENTER_CLICK').ok,true);assert.equal(result.continuations.find(c=>c.kind==='CENTER_CLICK').reason,'INTRO_DISMISSED');
});

// Silently exiting at the first unavailable control must fail this regression.
test('a confirmed absent spin remains pending within the original operation deadline',async()=>{
 const h=operationHarness();h.onSpin=()=>({ok:false,clicked:false,retryable:true,reason:'NO_OBSERVED_NORMAL_SPIN'});
 const result=await h.finish({timeoutMs:7000});
 assert.equal(result.reason,'OPERATION_TIMEOUT');assert.equal(result.ok,false);assert(h.attempts>1);assert.deepEqual(h.centerTimes,[5000]);assert.equal(h.entries.length,1);
 assert.equal(result.verification,null);assert.equal(result.completion.phase,'verification_control');assert(result.completion.blockers.includes('NORMAL_SPIN_CONTROL_UNAVAILABLE'));
});

// Treating a possibly dispatched click as retryable must fail this regression.
test('an uncertain click failure never retries or claims a verification request',async()=>{
 const h=operationHarness();h.onSpin=()=>({ok:false,clicked:true,retryable:true,reason:'CLICK_OUTCOME_UNKNOWN'});
 const result=await h.finish();
 assert.equal(result.ok,false);assert.equal(result.reason,'NORMAL_SPIN_CONTROL_UNAVAILABLE');assert.equal(h.attempts,1);assert.deepEqual(h.centerTimes,[]);assert.equal(result.verification,null);
 assert.equal(result.completion.lastSpinAttempt.clicked,true);
});

test('a legacy failure without explicit no-click proof is never retried',async()=>{
 const h=operationHarness();h.onSpin=()=>({ok:false});const result=await h.finish();
 assert.equal(result.ok,false);assert.equal(h.attempts,1);assert.equal(result.verification,null);
});

// Recording the preceding purchase as verification must fail this regression.
test('an accepted click without a new request keeps verification null and never clicks spin again',async()=>{
 const h=operationHarness();h.onSpin=()=>({ok:true,clicked:true,sequenceBefore:h.entries.length});
 const result=await h.finish({timeoutMs:3000});
 assert.equal(result.ok,false);assert.equal(result.reason,'OPERATION_TIMEOUT');assert.equal(h.attempts,1);assert.equal(result.verification,null);
 assert.equal(result.completion.phase,'verification_request');assert(result.completion.blockers.includes('VERIFICATION_REQUEST_NOT_OBSERVED'));assert.deepEqual(h.centerTimes,[]);
});

// Re-clicking while the first request is delayed must fail this regression.
test('a delayed verification request completes the accepted click without a second attempt',async()=>{
 const h=operationHarness();h.onSpin=()=>({ok:true,clicked:true,sequenceBefore:h.entries.length});
 h.onTick=()=>{if(h.time>=2000&&h.entries.length===1)h.entries.push(entry());};
 const result=await h.finish();
 assert.equal(result.ok,true);assert.equal(h.attempts,1);assert.equal(result.verification.sequence,2);assert.equal(result.completion.phase,'complete');
});

// Using a later successful spin to replace the first failed verification must fail.
test('the first failed verification cannot be replaced by a later successful response',async()=>{
 const h=operationHarness();h.onSpin=()=>{const sequenceBefore=h.entries.length;h.entries.push(entry('',500,'error=failed'),entry());return {ok:true,clicked:true,sequenceBefore};};
 const result=await h.finish();
 assert.equal(result.ok,false);assert.equal(result.reason,'OPERATION_SERVER_ERROR');assert.equal(result.verification.sequence,2);assert.equal(result.verification.status,500);
 assert(result.completion.blockers.includes('VERIFICATION_SERVER_ERROR'));assert.equal(h.attempts,1);
});

// Using a later completed spin to mask the first pending response must fail.
test('the first pending verification stays incomplete despite a later completed spin',async()=>{
 const h=operationHarness();h.onSpin=()=>{const sequenceBefore=h.entries.length;h.entries.push(entry('',0,''),entry());return {ok:true,clicked:true,sequenceBefore};};
 const result=await h.finish({timeoutMs:3000});
 assert.equal(result.ok,false);assert.equal(result.verification.sequence,2);assert.equal(result.verification.complete,false);assert(result.completion.blockers.includes('VERIFICATION_RESPONSE_INCOMPLETE'));
});

test('the first pending verification can finish without changing its original payload',async()=>{
 const h=operationHarness();h.onSpin=()=>{const sequenceBefore=h.entries.length;h.entries.push(entry('bl=1',0,''),entry('bl=2'));return {ok:true,clicked:true,sequenceBefore};};
 h.onTick=()=>{if(h.time>=2000&&h.entries.length===3)h.entries[1]=entry('bl=1');};
 const result=await h.finish();
 assert.equal(result.ok,true);assert.equal(result.verification.payload.bl,'1');assert.equal(result.verification.sequence,2);assert.equal(h.attempts,1);
});

for(const gate of ['menu','choices'])test(`a ${gate} appearing during control recovery blocks continuation and spin`,async()=>{
 const h=operationHarness();h.onSpin=()=>({ok:false,clicked:false,retryable:true,reason:'NO_OBSERVED_NORMAL_SPIN'});
 h.onTick=()=>{if(h.time>=1000){if(gate==='menu')h.menuOpen=true;else h.choices=[{key:'a'}];}};
 h.adapter.choose=async()=>({ok:true});
 const result=await h.finish({timeoutMs:6000});
 assert.equal(result.ok,false);assert.equal(h.attempts,1);assert.deepEqual(h.centerTimes,[]);assert.deepEqual(h.advanceTimes,[]);
 assert(result.completion.blockers.includes(gate==='menu'?'PURCHASE_MENU_OPEN':'VISIBLE_CHOICES_PENDING'));
});

// New traffic must defer a fallback even while normal flags stay true.
test('recent traffic defers the center fallback during spin control recovery',async()=>{
 const h=operationHarness();h.onSpin=()=>({ok:false,clicked:false,retryable:true,reason:'NO_OBSERVED_NORMAL_SPIN'});
 const snapshot=h.snapshot;h.snapshot=()=>({...snapshot(),traffic:h.time<1000?0:Math.floor(h.time/500)});
 const result=await h.finish({timeoutMs:6000});
 assert.equal(result.ok,false);assert.equal(result.reason,'OPERATION_TIMEOUT');assert.equal(h.attempts,1);assert.deepEqual(h.centerTimes,[]);assert.deepEqual(h.advanceTimes,[]);
});

// Relaxing a historical terminal flag or exporting raw runtime must fail.
test('terminal diagnostics identify conservative blockers without exporting raw state',async()=>{
 const h=operationHarness();h.flags={...h.flags,stopActive:true,lastWinIsCounting:true,private:'secret'};
 const result=await h.finish({timeoutMs:1000});
 assert.equal(result.ok,false);assert.equal(h.attempts,0);assert(result.completion.blockers.includes('STOP_ACTIVE'));assert(result.completion.blockers.includes('WIN_COUNTING'));
 assert.deepEqual(result.completion.evidence,{tab_id:42,capture_id:'capture',full_path:'screen.jpg',artifact_dir:'evidence'});
 assert(!JSON.stringify(result.completion).includes('private'));assert(!JSON.stringify(result.completion).includes('balance'));assert(!JSON.stringify(result.completion).includes('traffic'));
});

test('continuation outcomes preserve a bounded sanitized reason',async()=>{
 const h=operationHarness();h.flags.canSpin=false;
 h.onCenter=()=>({ok:false,reason:'token=private&action=continue&detail='+('x'.repeat(500))});
 const result=await h.finish({timeoutMs:6000});
 const continued=result.continuations.find(c=>c.kind==='CENTER_CLICK');assert.equal(continued.ok,false);assert(!continued.reason.includes('private'));assert(continued.reason.length<=257);
});

// A legacy snapshot with several new spins cannot identify the first verification.
test('legacy verification evidence is accepted only for the exact next spin sequence',async()=>{
 const h=operationHarness();
 const snapshot=h.snapshot;h.snapshot=()=>{const s=snapshot();delete s.operation.verification;return s;};
 h.onSpin=()=>{const sequenceBefore=h.entries.length;h.entries.push(entry(),entry());return {ok:true,sequenceBefore};};
 const result=await h.finish({timeoutMs:3000});
 assert.equal(result.ok,false);assert.equal(result.verification,null);assert.equal(h.attempts,1);assert(result.completion.blockers.includes('VERIFICATION_REQUEST_NOT_OBSERVED'));
});

// A purchase request after the click is not ordinary verification evidence.
test('a purchased verification request cannot certify a normal verification spin',async()=>{
 const h=operationHarness();h.onSpin=()=>{const sequenceBefore=h.entries.length;h.entries.push(entry('pur=1'));return {ok:true,clicked:true,sequenceBefore};};
 const result=await h.finish({timeoutMs:3000});
 assert.equal(result.ok,false);assert.equal(result.verification.kind,'purchase');assert(result.completion.blockers.includes('VERIFICATION_NOT_NORMAL_SPIN'));assert.equal(h.attempts,1);
});

test('stage diagnostics retain only known names and boolean lifecycle fields',async()=>{
 const h=operationHarness(),snapshot=h.snapshot;h.flags.stopActive=true;
 h.snapshot=()=>({...snapshot(),stageDetails:[{name:'StageResult',spinEnded:true,changeToResult:false,mustSpin:'private',raw:'private'},{name:'private',spinEnded:true}]});
 const result=await h.finish({timeoutMs:1000});
 assert.deepEqual(result.completion.stageDetails,[{name:'StageResult',mustSpin:null,fsStartConfirmed:null,shouldEnterFS:null,freeSpinsEnded:null,changeToResult:false,spinEnded:true}]);
 assert(!JSON.stringify(result.completion).includes('private'));
});

// A changed client flag after an accepted click cannot authorize another server action.
test('an accepted click with no request blocks recovery even if runtime flags become busy',async()=>{
 const h=operationHarness();h.onSpin=()=>{h.flags.canSpin=false;return {ok:true,clicked:true,sequenceBefore:h.entries.length};};
 const result=await h.finish({timeoutMs:7000});
 assert.equal(result.ok,false);assert.equal(result.verification,null);assert.equal(h.attempts,1);assert.deepEqual(h.advanceTimes,[]);assert.deepEqual(h.centerTimes,[]);
 assert(result.completion.blockers.includes('VERIFICATION_REQUEST_NOT_OBSERVED'));
});

// Continuous activity must explain why terminal flags never earned two stable samples.
test('terminal snapshots with continuous traffic report unstable readiness without attempting spin',async()=>{
 const h=operationHarness(),snapshot=h.snapshot;
 h.snapshot=()=>({...snapshot(),traffic:h.time,evidence:{capture_id:'capture-'+h.time,full_path:'screen-'+h.time+'.jpg'}});
 const result=await h.finish({timeoutMs:2000});
 assert.equal(result.reason,'OPERATION_TIMEOUT');assert.equal(h.attempts,0);assert(result.completion.blockers.includes('READINESS_NOT_STABLE'));
 assert.deepEqual(result.completion.readiness,{ticks:1,requiredTicks:2,quietMs:0,assessedAtMs:1500});
 assert.equal(result.completion.evidence.capture_id,'capture-1500');assert.equal(result.snapshot.evidence.capture_id,'capture-1500');
});
