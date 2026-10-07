import test from 'node:test';
import assert from 'node:assert/strict';
import {finishOperation} from '../providers/pragmatic/operation-completion.js';

// Exercise the real operation loop with a deterministic clock and a completed
// purchase. No browser, server or random reel outcome is required.
function harness({changeAt=Infinity,change='traffic',slowStopMs=0,stop=false}={}) {
  let time=0,stopped=false;
  const inputs=[];
  const snapshot=()=>({
    key:change==='ui'&&time>=changeAt?'feature-b':'feature-a',
    controls:[{key:change==='ui'&&time>=changeAt?'feature-b':'feature-a'}],
    choices:[],wager:{menuOpen:false},
    capture:{pending:false,uncertain:false},
    traffic:change==='traffic'&&time>=changeAt?2:1,
    flags:{canSpin:false,stopActive:stop&&!stopped,stages:[]},
    operation:{sequence:1,protocolSequence:1,kind:'purchase',
      transaction:{kind:'purchase',complete:true,status:200},
      protocolComplete:true,nextAction:'s'}
  });
  const adapter={
    now:()=>time,
    sleep:async ms=>{time+=ms;},
    snapshot:async()=>snapshot(),
    advance:async()=>{
      if(!stop||stopped)return {ok:true,kind:'WAIT'};
      time+=slowStopMs;
      stopped=true;
      inputs.push({kind:'stop',time});
      return {ok:true,clicked:true,kind:'OBSERVED_STOP'};
    },
    clickCenter:async()=>{inputs.push({kind:'center',time});return {ok:true};}
  };
  return {inputs,run:(options={})=>finishOperation(adapter,{operation:{sequence:0}},snapshot(),{
    verifyPurchase:false,timeoutMs:13000,stallMs:15000,
    recoveryQuietMs:4000,recoveryGapMs:4000,...options
  })};
}

test('center recovery waits the configured quiet window after new protocol traffic',async()=>{
  const h=harness({changeAt:4500});
  await h.run();
  const first=h.inputs.find(i=>i.kind==='center');
  assert.ok(first,'an eligible center continuation must remain reachable');
  assert.ok(first.time>=8500,`center dispatched at ${first.time}ms, before 4s of quiet`);
});

test('changed observed controls restart the recovery stability window without network traffic',async()=>{
  const h=harness({changeAt:4500,change:'ui'});
  await h.run();
  const first=h.inputs.find(i=>i.kind==='center');
  assert.ok(first,'an eligible center continuation must remain reachable');
  assert.ok(first.time>=8500,`center dispatched at ${first.time}ms on a newly changed UI`);
});

for(const slowStopMs of [0,2500])test(`Stop and center share an input cooldown measured after dispatch (${slowStopMs}ms Stop)`,async()=>{
  const h=harness({stop:true,slowStopMs});
  await h.run({timeoutMs:16000});
  const stopped=h.inputs.find(i=>i.kind==='stop'),center=h.inputs.find(i=>i.kind==='center');
  assert.ok(stopped,'Stop must still be dispatched');
  assert.ok(center,'a later stable center fallback must remain reachable');
  assert.ok(center.time-stopped.time>=4000,`center followed Stop after only ${center.time-stopped.time}ms`);
});

test('a deadline inside the recovery quiet window preserves the operation without an input',async()=>{
  const h=harness({changeAt:4500});
  const result=await h.run({timeoutMs:8000});
  assert.equal(result.reason,'OPERATION_TIMEOUT');
  assert.deepEqual(h.inputs,[]);
});
