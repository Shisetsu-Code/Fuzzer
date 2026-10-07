import test from 'node:test';
import assert from 'node:assert/strict';
import {finishOperation,operationStateFromEntries} from '../providers/pragmatic/operation-completion.js';

const entry=(extra='',status=200,text='na=s')=>({request:{url:'https://demogamesfree.pragmaticplay.net/gs2c/gameService?token=private',postData:{text:`action=doSpin&c=0.1&l=20&${extra}`}},response:{status,content:{text}}});
const snapshot=(entries,afterSequence,choices=[])=>({key:'base',controls:[],choices,traffic:entries.length,flags:{canSpin:!choices.length,stages:[]},wager:{menuOpen:false},operation:operationStateFromEntries(entries,{afterSequence})});

// Selecting the latest spin instead of the first new one must fail this test.
test('a delayed purchase snapshot preserves its submission and verifies one normal spin',async()=>{
 let t=0,spins=0;
 const entries=[entry('pur=2&mgckey=private',200,'na=m&fs=1'),entry('',200,'na=s')];
 const a={now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>snapshot(entries,0),spinNormal:async()=>{spins++;entries.push(entry('',200,'na=s'));return {ok:true}}};
 const result=await finishOperation(a,{operation:{sequence:0}},snapshot(entries,0),{timeoutMs:5000});
 assert.equal(result.kind,'purchase');assert.equal(result.ok,true);assert.equal(result.verificationRequired,true);assert.equal(spins,1);
 assert.equal(result.submission.payload.pur,'2');assert.equal(result.submission.sequence,1);assert.equal(result.verification.kind,'spin');
 assert(!JSON.stringify(result).includes('private'));
});

// Anchoring to the first purchase anywhere in the HAR must fail this test.
test('an old purchase cannot classify a newly submitted ordinary spin',async()=>{
 let t=0,spins=0;const entries=[entry('pur=4'),entry()];
 const a={now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>snapshot(entries,1),spinNormal:async()=>{spins++;return {ok:true}}};
 const result=await finishOperation(a,{operation:{sequence:1}},snapshot(entries,1),{timeoutMs:2000});
 assert.equal(result.ok,true);assert.equal(result.kind,'spin');assert.equal(result.verificationRequired,false);assert.equal(spins,0);
 assert.equal(result.submission.sequence,2);assert.equal(result.submission.payload.pur,undefined);
});

// Using the latest successful response to hide a failed submission must fail.
test('a rejected original purchase stays failed after a later successful spin',async()=>{
 let t=0,spins=0;const entries=[entry('pur=0',500,'error=failed'),entry()];
 const a={now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>snapshot(entries,0),spinNormal:async()=>{spins++;return {ok:true}}};
 const result=await finishOperation(a,{operation:{sequence:0}},snapshot(entries,0),{timeoutMs:2000});
 assert.equal(result.ok,false);assert.equal(result.reason,'OPERATION_SERVER_ERROR');assert.equal(result.submission.status,500);assert.equal(spins,0);
});

// Treating an incomplete original response as complete must fail.
test('a pending original response blocks verification despite a later completed spin',async()=>{
 let t=0,spins=0;const entries=[entry('pur=0',0,''),entry()];
 const a={now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>snapshot(entries,0),spinNormal:async()=>{spins++;return {ok:true}}};
 const result=await finishOperation(a,{operation:{sequence:0}},snapshot(entries,0),{timeoutMs:2000});
 assert.equal(result.ok,false);assert.equal(result.reason,'OPERATION_TIMEOUT');assert.equal(result.submission.complete,false);assert.equal(spins,0);
});

// Freezing original response status at first observation must fail.
test('the original pending response can complete without changing purchase identity',async()=>{
 let t=0,spins=0;const entries=[entry('pur=3',0,''),entry()];
 const a={now:()=>t,sleep:async ms=>{t+=ms;if(t===1000)entries[0]=entry('pur=3');},snapshot:async()=>snapshot(entries,0),spinNormal:async()=>{spins++;entries.push(entry());return {ok:true}}};
 const result=await finishOperation(a,{operation:{sequence:0}},snapshot(entries,0),{timeoutMs:5000});
 assert.equal(result.ok,true);assert.equal(result.kind,'purchase');assert.equal(result.submission.payload.pur,'3');assert.equal(result.submission.complete,true);assert.equal(spins,1);
});

// Falling back to a historical request when the boundary has no submission must fail.
test('an unavailable original submission never authorizes a verification spin',async()=>{
 let t=0,spins=0;const entries=[entry('pur=0')];
 const a={now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>snapshot(entries,1),spinNormal:async()=>{spins++;return {ok:true}}};
 const result=await finishOperation(a,{operation:{sequence:1}},snapshot(entries,1),{timeoutMs:2000});
 assert.equal(result.ok,false);assert.equal(result.reason,'OPERATION_SUBMISSION_UNAVAILABLE');assert.equal(spins,0);
});

// Completing a purchase without a completed new ordinary-spin request must fail.
test('a delayed purchase requires a completed verification response',async()=>{
 let t=0,spins=0;const entries=[entry('pur=0'),entry()];
 const a={now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>snapshot(entries,0),spinNormal:async()=>{spins++;entries.push(entry('',0,''));return {ok:true}}};
 const result=await finishOperation(a,{operation:{sequence:0}},snapshot(entries,0),{timeoutMs:2000});
 assert.equal(result.ok,false);assert.equal(result.reason,'OPERATION_TIMEOUT');assert.equal(spins,1);assert.equal(result.normalSpinVerified,false);
});

// Losing the purchase classification after automatic spins must fail this test.
test('choices after a delayed purchase remain a purchase family',async()=>{
 let t=0,selected=false,spins=0;const entries=[entry('pur=1'),entry()];
 const snap=()=>snapshot(entries,0,selected?[]:[{key:'a'},{key:'b'}]);
 const a={now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>snap(),choose:async c=>{assert.equal(c.key,'b');selected=true;return {ok:true}},spinNormal:async()=>{spins++;entries.push(entry());return {ok:true}}};
 const result=await finishOperation(a,{operation:{sequence:0}},snap(),{choicePlan:['b'],timeoutMs:5000});
 assert.equal(result.ok,true);assert.equal(result.kind,'purchase');assert.equal(result.decisions[0].selected,'b');assert.deepEqual(result.decisions[0].options.map(o=>o.key),['a','b']);assert.equal(spins,1);
});
