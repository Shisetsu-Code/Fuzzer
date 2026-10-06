import test from 'node:test';import assert from 'node:assert/strict';import {exploreStates,waitTransition} from '../providers/pragmatic/state-explorer.js';
test('cancel returns to root without looping; sibling is replayed and explored',async()=>{
 let state='root',resets=0;const controls={root:[{key:'open'}],menu:[{key:'cancel'},{key:'accept'}],done:[]};
 const a={reset:async()=>{state='root';resets++},snapshot:async()=>({key:state,controls:controls[state],traffic:0}),click:async b=>{state=b.key==='open'?'menu':b.key==='cancel'?'root':'done'},sleep:async()=>{},now:()=>0};
 const r=await exploreStates(a,{maxActions:6,wait:async(a,b)=>({snapshot:await a.snapshot(),reason:'STATE_CHANGED'})});
 assert.equal(r.edges.length,3);assert(r.edges.some(e=>e.action==='cancel'&&e.to==='root'));assert(r.edges.some(e=>e.action==='accept'&&e.to==='done'));assert(resets>=3);assert.equal(r.status,'EXHAUSTED_OBSERVED_CONTROLS');
});
test('new payload keeps the observation alive beyond ten seconds and allows a continuation click',async()=>{
 let t=0,clicks=0;const a={now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>({key:t>=18000?'done':'root',controls:[],traffic:Math.floor(t/3000)}),clickCenter:async()=>{clicks++}};
 const r=await waitTransition(a,{key:'root',controls:[],traffic:0},{quietMs:10000,activeMs:60000,pollMs:1000});assert.equal(r.snapshot.key,'done');assert(t>10000);assert(clicks>0);
});
test('failed replay stays pending and never tries a stale coordinate',async()=>{
 let resets=0,state='root',stale=false;const a={reset:async()=>{resets++;state=resets===1?'root':'different'},snapshot:async()=>({key:state,controls:state==='root'?[{key:'open'}]:state==='menu'?[{key:'next'}]:[],traffic:0}),click:async b=>{if(b.key==='next')stale=true;state='menu'}};
 const r=await exploreStates(a,{maxActions:5,wait:async a=>({snapshot:await a.snapshot()})});assert(r.pending.length);assert.equal(stale,false);
});
test('a changed screen with active payloads is observed until traffic settles',async()=>{
 let t=0;const a={now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>({key:'new',controls:[{key:'button'}],traffic:Math.min(t,12000)})};
 const r=await waitTransition(a,{key:'old',controls:[],traffic:0},{pollMs:1000});assert(t>=22000);assert.equal(r.snapshot.key,'new');
});

test('late choice observed at the probe gate is added as a child without a spin',async()=>{let state='root';const snap=()=>({key:state,controls:state==='root'?[{key:'open'}]:state==='choice'?[{key:'accept'}]:[],traffic:0});const a={reset:async()=>{state='root'},snapshot:async()=>snap(),click:async()=>{state='loading'},afterAction:async()=>{state='choice';return {performed:false,observedSnapshot:snap()}}};const r=await exploreStates(a,{maxActions:1,wait:async()=>({snapshot:snap(),reason:'STATE_CHANGED'})});assert.equal(r.edges[0].to,'choice');assert(r.pending.some(p=>p.action==='accept'));assert.equal(r.edges[0].followup.performed,false);});

test('unresolved drawings are pending evidence instead of an empty successful graph',async()=>{const a={reset:async()=>{},snapshot:async()=>({key:'root',controls:[],unresolved:[{path:'feature',reason:'NO_VERIFIED_VISIBLE_DRAWING'}],evidence:{full_path:'screen.jpg'}})};const r=await exploreStates(a);assert.equal(r.status,'PARTIAL');assert.equal(r.pending[0].reason,'UNRESOLVED_DRAWING');assert.equal(r.pending[0].evidence.full_path,'screen.jpg');});

test('a submitted purchase is completed without adding random bonus states to replay',async()=>{
 let phase='root',sequence=0,finished=0,random=0;const clicked=[];
 const snap=()=>({key:phase==='bonus'?`random-${random++}`:phase,controls:phase==='root'?[{key:'buy'}]:[{key:'stop'}],traffic:sequence,operation:{sequence}});
 const a={reset:async()=>{phase='root';sequence=0},snapshot:async()=>snap(),click:async b=>{clicked.push(b.key);phase='bonus';sequence++},
 operationStarted:(before,after)=>after.operation.sequence>before.operation.sequence,
 finishOperation:async()=>{finished++;phase='root';return {ok:true,kind:'purchase',normalSpinVerified:true,decisions:[],snapshot:snap()}}};
 const r=await exploreStates(a,{maxActions:5,wait:async()=>({snapshot:snap(),reason:'STATE_CHANGED'})});
 assert.deepEqual(clicked,['buy']);assert.equal(finished,1);assert.equal(r.nodes.length,1);assert.equal(r.pending.length,0);assert.equal(r.edges[0].operation.normalSpinVerified,true);
});

test('internal purchase choices replay only the purchase path, never a random bonus key',async()=>{
 let phase='root',sequence=0,random=0;const chosen=[];
 const snap=()=>({key:phase==='bonus'?`bonus-${random++}`:phase,controls:phase==='root'?[{key:'buy'}]:[{key:'unrelated-stop'}],traffic:sequence,operation:{sequence}});
 const a={reset:async()=>{phase='root';sequence=0},snapshot:async()=>snap(),click:async()=>{phase='bonus';sequence++},operationStarted:(b,s)=>s.operation.sequence>b.operation.sequence,
 finishOperation:async(b,s,{choicePlan=[]}={})=>{const selected=choicePlan[0]||'a';chosen.push(selected);phase='root';return {ok:true,normalSpinVerified:true,snapshot:snap(),decisions:[{id:'selection',parent:null,options:[{key:'a'},{key:'b'}],selected}]}}};
 const r=await exploreStates(a,{maxActions:5,wait:async()=>({snapshot:snap(),reason:'STATE_CHANGED'})});
 assert.deepEqual(chosen,['a','b']);assert.equal(r.pending.length,0);assert.equal(r.nodes.length,1);assert.equal(r.edges.length,2);
});

test('nested choice prefixes already traversed are not purchased again unnecessarily',async()=>{
 let phase='root',sequence=0;const paths=[];
 const snap=()=>({key:phase,controls:phase==='root'?[{key:'buy'}]:[],operation:{sequence}});
 const a={reset:async()=>{phase='root';sequence=0},snapshot:async()=>snap(),click:async()=>{phase='bonus';sequence++},operationStarted:(b,s)=>s.operation.sequence>b.operation.sequence,
 finishOperation:async(b,s,{choicePlan=[]}={})=>{const first=choicePlan[0]||'a',second=choicePlan[1]||'x';paths.push(first+'/'+second);phase='root';return {ok:true,snapshot:snap(),decisions:[{options:[{key:'a'},{key:'b'}],selected:first},{options:[{key:'x'},{key:'y'}],selected:second}]}}};
 const r=await exploreStates(a,{maxActions:20,wait:async()=>({snapshot:snap()})});
 assert.equal(r.pending.length,0);assert.deepEqual(paths.sort(),['a/x','a/y','b/x','b/y']);
});
test('a random feature triggered by an ordinary antebet spin does not create replay branches',async()=>{
 let phase='root',sequence=0,clicks=0;
 const snap=()=>({key:phase,controls:phase==='root'?[{key:'ante'}]:[],operation:{sequence}});
 const a={reset:async()=>{phase='root';sequence=0},snapshot:async()=>snap(),click:async()=>{phase='bonus';sequence++;clicks++},operationStarted:(b,s)=>s.operation.sequence>b.operation.sequence,
 finishOperation:async(b,s,{choicePlan=[]}={})=>{phase='root';return {ok:true,kind:'spin',snapshot:snap(),decisions:[{options:[{key:'a'},{key:'b'}],selected:choicePlan[0]||'a'}]}}};
 await exploreStates(a,{maxActions:5,wait:async()=>({snapshot:snap()})});assert.equal(clicks,1);
});


test('action traversal is breadth-first: siblings are explored before grandchildren',async()=>{
 let state='root';
 const controls={root:[{key:'open'}],menu:[{key:'a'},{key:'b'}],A:[{key:'a1'}],B:[],A1:[]};
 const a={reset:async()=>{state='root'},snapshot:async()=>({key:state,controls:controls[state]||[],traffic:0}),click:async b=>{
  if(state==='root'&&b.key==='open')state='menu';
  else if(state==='menu'&&b.key==='a')state='A';
  else if(state==='menu'&&b.key==='b')state='B';
  else if(state==='A'&&b.key==='a1')state='A1';
 }};
 const r=await exploreStates(a,{mode:'actions',maxActions:10,maxRetries:0,wait:async()=>({snapshot:await a.snapshot(),reason:'STATE_CHANGED'})});
 assert.deepEqual(r.edges.map(e=>e.action),['open','a','b','a1']);
});


test('action transition ignores a transient main-screen flash and requires four seconds of stable state',async()=>{
 let t=0;
 const a={
  now:()=>t,
  sleep:async ms=>{t+=ms},
  snapshot:async()=>{
   const flash=t>=500&&t<1500,real=t>=2500;
   const key=flash?'flash':real?'menu':'root';
   const marker=flash?'flash-marker':real?'menu-marker':'root-marker';
   return {key,controls:key==='root'?[]:[{key:'button'}],traffic:marker,inputReady:true,capture:{marker,pending:false,uncertain:false}};
  }
 };
 const before={key:'root',controls:[],traffic:'root-marker',capture:{marker:'root-marker',pending:false,uncertain:false}};
 const result=await waitTransition(a,before,{mode:'actions',pollMs:500,quietMs:2000,stableMs:4000,activeMs:15000});
 assert.equal(result.snapshot.key,'menu');assert(t>=6500,`state was accepted too early at ${t}ms`);
});
