import test from 'node:test';
import assert from 'node:assert/strict';
import {waitTransition,exploreStates} from '../providers/pragmatic/state-explorer.js';
import {finishOperation} from '../providers/pragmatic/operation-completion.js';

const ready=(key,traffic=0)=>({key,controls:[{key:'button'}],traffic,inputReady:true,capture:{pending:false,marker:'init'}});
function clocked(snapshot){let t=0;return {now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>snapshot(t)};}
test('action mode advances a stable available menu despite background traffic',async()=>{
 const a=clocked(t=>ready('menu',t));
 const r=await waitTransition(a,ready('root'),{mode:'actions',pollMs:500,activeMs:5000});
 assert.equal(r.reason,'STATE_CHANGED');assert(r.elapsedMs<=1500);
});
test('action mode never advances a menu while its own request or capture is pending',async()=>{
 const a=clocked(t=>({...ready('menu',t),capture:{pending:true,marker:'request'}}));
 const r=await waitTransition(a,ready('root'),{mode:'actions',pollMs:500,activeMs:2000});
 assert.equal(r.reason,'ACTIVE_TIMEOUT');
});
test('action mode requires fresh readiness rather than just a changed drawing',async()=>{
 const a=clocked(t=>({...ready('menu',t),inputReady:false}));
 const r=await waitTransition(a,ready('root'),{mode:'actions',pollMs:500,activeMs:2000});
 assert.equal(r.reason,'ACTIVE_TIMEOUT');
});
test('an uncertain capture never authorizes a blind center click',async()=>{
 let clicks=0;const a=clocked(t=>({...ready('loading',t),controls:[],inputReady:false,capture:{pending:true,marker:'request'}}));a.clickCenter=async()=>{clicks++};
 await waitTransition(a,ready('root'),{mode:'actions',pollMs:1000,activeMs:7000});
 assert.equal(clicks,0);
});
test('action mode can reach the probe gate on an unchanged ready base with background traffic',async()=>{
 const a=clocked(t=>ready('root',t));
 const r=await waitTransition(a,ready('root'),{mode:'actions',pollMs:500,quietMs:2000,activeMs:5000});
 assert.equal(r.reason,'QUIET_TIMEOUT');assert.equal(r.elapsedMs,2000);
});
test('a failed first click is isolated before trying its sibling',async()=>{
 let resets=0;const clicks=[];const a={reset:async()=>{resets++},snapshot:async()=>({key:'root',controls:[{key:'a'},{key:'b'}]}),click:async b=>{clicks.push([b.key,resets]);throw Error('uncertain dispatch')}};
 const r=await exploreStates(a,{maxActions:2});
 assert.deepEqual(clicks,[['a',1],['b',2]]);assert.equal(r.pending.length,2);
});
test('durable progress precedes dispatch and retains siblings and the in-flight route',async()=>{
 const progress=[];let clicks=0;const a={reset:async()=>{},snapshot:async()=>({key:'root',controls:[{key:'a'},{key:'b'}]}),click:async()=>{clicks++;assert(progress.some(p=>p.inFlight?.action==='a'&&p.queued?.some(t=>t.action==='b')));throw Error('uncertain dispatch')}};
 await exploreStates(a,{maxActions:1,onProgress:async p=>progress.push(structuredClone(p))});assert.equal(clicks,1);
});
test('capture mode completes an accepted operation without a classification-dependent extra spin',async()=>{
 const op={sequence:1,kind:'purchase',transaction:{kind:'purchase',complete:true,status:200},protocolComplete:true,nextAction:'s'};
 const s={...ready('root'),operation:op,flags:{canSpin:true,stages:['StageResult']},wager:{menuOpen:false}};
 let spins=0;const a=clocked(()=>s);a.spinNormal=async()=>{spins++;return {ok:false}};
 const r=await finishOperation(a,{operation:{sequence:0}},s,{verifyPurchase:false,timeoutMs:2000});
 assert.equal(r.ok,true);assert.equal(r.normalSpinVerified,false);assert.equal(r.verificationRequired,false);assert.equal(spins,0);
});
test('action evidence remains valid when a later continuation times out',async()=>{
 let sequence=0;const s=()=>({key:'root',controls:[{key:'a'}],operation:{sequence}});
 const a={reset:async()=>{sequence=0},snapshot:async()=>s(),click:async()=>{sequence++},operationStarted:(b,n)=>n.operation.sequence>b.operation.sequence,finishOperation:async()=>({ok:false,kind:'spin',reason:'OPERATION_TIMEOUT',submission:{status:200,complete:true},snapshot:s()})};
 const r=await exploreStates(a,{mode:'actions',wait:async()=>({snapshot:s(),reason:'OPERATION_STARTED'})});
 assert.equal(r.edges[0].validity?.valid,true);assert.equal(r.edges[0].operation.ok,false);assert.equal(r.pending.length,1);
});
test('every observed decision is replayed in action mode regardless of operation label',async()=>{
 let seq=0;const chosen=[];const snap=()=>({key:'root',controls:[{key:'a'}],operation:{sequence:seq}});
 const a={reset:async()=>{seq=0},snapshot:async()=>snap(),click:async()=>{seq++},operationStarted:(b,n)=>n.operation.sequence>b.operation.sequence,
 finishOperation:async(b,n,{choicePlan=[]})=>{const selected=choicePlan[0]||'x';chosen.push(selected);return {ok:true,kind:'spin',decisions:[{selected,options:[{key:'x'},{key:'y'},{key:'z'}]}],snapshot:snap()};}};
 await exploreStates(a,{mode:'actions',wait:async()=>({snapshot:snap()})});assert.deepEqual(chosen,['x','y','z']);
});
test('recovery preserves an in-flight dispatch separately from confirmed evidence',async()=>{
 const {createProgressCheckpoint}=await import('../scripts/ci/run-live-demo.mjs');const c=createProgressCheckpoint();
 c.record({nodes:[],edges:[],pending:[],actions:0,queued:[{action:'sibling'}],inFlight:{action:'clicked',phase:'action'}});
 const r=c.recover(Error('CI_FINAL_BUDGET_EXCEEDED'));assert.equal(r.inFlight.action,'clicked');assert.equal(r.queued[0].action,'sibling');assert.equal(r.edges.length,0);assert.equal(r.completeGame,false);
});
