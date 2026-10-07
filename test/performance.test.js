import test from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../lib/performance.js').catch(() => ({}));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };

test('the bounded performance recorder and independent-task runner are available', () => {
  for (const name of ['createBenchmark','withBenchmark','measure','independent','mapConcurrent']) assert.equal(typeof api[name], 'function', name);
});
test('nested spans subtract overlapping child time once and keep a monotonic timeline', async () => {
  const {createBenchmark,withBenchmark,measure} = api; let time = 0;
  const b = createBenchmark({now:()=>time}); const a=deferred(),c=deferred();
  await withBenchmark(b,()=>measure('test.parent',async()=>{
    time=5; const p=measure('test.child-a',()=>a.promise), q=measure('test.child-b',()=>c.promise);
    time=10;a.resolve();await p; time=15;c.resolve();await q; time=20;
  }));
  const r=b.report(); const parent=r.stages.find(s=>s.name==='test.parent');
  assert.equal(parent.totalMs,20);assert.equal(parent.selfMs,10);assert.equal(parent.count,1);
  assert.equal(r.trace.length,3);assert.equal(r.active.length,0);
});
test('errors preserve the original exception but never serialize its message or task data', async()=>{
  const {createBenchmark,withBenchmark,measure}=api;const b=createBenchmark();const error=Error('token=SUPER_SECRET');
  await assert.rejects(withBenchmark(b,()=>measure('test.failure',async()=>{throw error;})),e=>e===error);
  assert.equal(b.report().stages[0].errors,1);assert(!JSON.stringify(b.report()).includes('SUPER_SECRET'));
});
test('trace and stage cardinality remain bounded while counts keep accumulating', async()=>{
  const {createBenchmark,withBenchmark,measure}=api;const b=createBenchmark({maxEvents:4,maxStages:2});
  await withBenchmark(b,async()=>{for(let i=0;i<30;i++)measure('test.n'+i,()=>null);});
  const r=b.report();assert.equal(r.trace.length,4);assert.equal(r.droppedEvents,26);assert(r.stages.length<=3);
  assert.equal(r.stages.reduce((n,s)=>n+s.count,0),30);
});
test('independent tasks run concurrently with stable output order', async()=>{
  const {mapConcurrent}=api;const gates=[deferred(),deferred(),deferred()];const started=[];
  const p=mapConcurrent(gates,async(g,i)=>{started.push(i);await g.promise;return i;},{concurrency:2});
  await Promise.resolve();assert.deepEqual(started,[0,1]);gates[1].resolve();await new Promise(r=>setImmediate(r));assert.deepEqual(started,[0,1,2]);
  gates[2].resolve();gates[0].resolve();assert.deepEqual(await p,[0,1,2]);
});
test('a rejected parallel task drains its siblings before returning and stops unscheduled work',async()=>{
  const {mapConcurrent}=api;const gate=deferred();const started=[];const error=Error('FAIL');let settled=false;
  const p=mapConcurrent([0,1,2],async(_,i)=>{started.push(i);if(i===0)throw error;await gate.promise;},{concurrency:2});
  p.then(()=>{settled=true;},()=>{settled=true;});await new Promise(r=>setImmediate(r));assert.equal(settled,false);assert.deepEqual(started,[0,1]);
  gate.resolve();await assert.rejects(p,e=>e===error);assert.deepEqual(started,[0,1]);
});
test('sequential reference mode does not overlap independent tasks; parallel mode is run-local',async()=>{
  const {withBenchmark,independent}=api;let running=0,peak=0;
  const tasks=Array.from({length:4},()=>async()=>{running++;peak=Math.max(peak,running);await new Promise(r=>setImmediate(r));running--;});
  await withBenchmark(null,()=>independent(tasks),{mode:'sequential'});assert.equal(peak,1);
  peak=0;await withBenchmark(null,()=>independent(tasks),{mode:'parallel'});assert.equal(peak,4);
});
test('invalid concurrency is rejected before any task executes',async()=>{
  let calls=0;for(const concurrency of [0,-1,1.5,100,NaN])await assert.rejects(api.mapConcurrent([0],()=>{calls++;},{concurrency}));assert.equal(calls,0);
});
