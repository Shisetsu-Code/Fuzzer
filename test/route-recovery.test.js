import test from 'node:test';
import assert from 'node:assert/strict';
import {exploreStates, waitTransition} from '../providers/pragmatic/state-explorer.js';
import {finishOperation} from '../providers/pragmatic/operation-completion.js';

function treeHarness({failOpen=0, alwaysFail=false, mismatchOnce=false, cleanupFails=false}={}) {
 let phase='root',session=0,t=0,opens=0,last='',finishes=0;
 const clicks=[];
 const snap=()=>({key:phase,controls:(phase==='root'?['open','sibling']:phase==='menu'?['child']:phase==='variant'?['new-child']:[]).map(key=>({key})),inputReady:true,capture:{pending:false,uncertain:false,marker:'idle'},evidence:{tab_id:session}});
 const a={now:()=>t,sleep:async ms=>{t+=ms},reset:async()=>{session++;if(cleanupFails&&session===3)throw Object.assign(Error('save failed'),{code:'SESSION_CLEANUP_FAILED',retainedTabIds:[session-1]});phase='root';},snapshot:async()=>snap(),click:async c=>{last=c.key;clicks.push([last,session]);if(last==='open'){opens++;phase=mismatchOnce&&opens===2?'variant':'menu';}else phase='done';}};
 const wait=async()=>{t+=10;return {snapshot:snap(),reason:alwaysFail||last==='open'&&opens<=failOpen?'ACTIVE_TIMEOUT':'STATE_CHANGED'};};
 return {a,wait,clicks,snap,time:()=>t,expire:()=>{t=1000;}};
}

 test('recoverable branches run after untouched siblings and use a clean session',async()=>{
 const h=treeHarness({failOpen:1});
 const r=await exploreStates(h.a,{mode:'actions',maxRetries:2,maxActions:20,wait:h.wait});
 assert.deepEqual(h.clicks.map(x=>x[0]),['open','sibling','open','child']);
 assert.notEqual(h.clicks[0][1],h.clicks[2][1]);
 assert.equal(h.clicks[2][1],h.clicks[3][1],'a recovered menu continues inline');
 assert.equal(r.pending.length,0);assert.equal(r.recovery.recoveredRoutes,1);
 assert.equal(r.attemptHistory[0].reason,'ACTIVE_TIMEOUT');assert.equal(r.stopReason,'EXHAUSTED_OBSERVED_CONTROLS');
});

 test('persistent failure has a finite attempt cap and one final blocker per route',async()=>{
 const h=treeHarness({alwaysFail:true});
 const r=await exploreStates(h.a,{mode:'actions',maxRetries:2,maxActions:20,wait:h.wait});
 assert.deepEqual(h.clicks.map(x=>x[0]),['open','sibling','open','sibling','open','sibling']);
 assert.equal(r.pending.length,2);assert(r.pending.every(p=>p.attempts===3&&p.disposition==='blocked'));
 assert.equal(r.attemptHistory.length,6);assert.equal(r.recovery.retries,4);assert.equal(r.stopReason,'BLOCKED_ROUTES');
});

 test('a budget defers recovery without discarding its route or previous failure',async()=>{
 const h=treeHarness({alwaysFail:true});
 const r=await exploreStates(h.a,{mode:'actions',maxRetries:2,maxActions:2,wait:h.wait});
 assert.equal(h.clicks.length,2);assert.equal(r.stopReason,'ACTION_LIMIT');
 assert.equal(r.pending.length,2);assert(r.pending.every(p=>p.disposition==='deferred'&&p.lastFailure==='ACTIVE_TIMEOUT'));
 assert.equal(r.queued.length,2);
});

 test('cleanup failure halts all retries and preserves remaining tasks',async()=>{
 const h=treeHarness({alwaysFail:true,cleanupFails:true});
 const r=await exploreStates(h.a,{mode:'actions',maxRetries:2,wait:h.wait});
 assert.equal(h.clicks.length,2);assert.equal(r.cleanupPending,true);assert.equal(r.stopReason,'CLEANUP_FAILED');
 assert.equal(r.pending.length,2);assert(r.pending.every(p=>p.reason==='SESSION_CLEANUP_FAILED'));
});

 test('replay mismatch learns the actual safe menu rather than discarding new options',async()=>{
 let phase='root',opens=0,menuReads=0;const clicks=[];
 const snap=()=>{if(phase==='menu'&&++menuReads>1)phase='variant';return {key:phase,controls:(phase==='root'?['open']:phase==='menu'?['child']:phase==='variant'?['new-child']:[]).map(key=>({key})),inputReady:true,capture:{pending:false}};};
 const a={reset:async()=>{phase='root';},snapshot:async()=>snap(),click:async c=>{clicks.push(c.key);if(c.key==='open')phase=++opens===1?'menu':'variant';else phase='done';}};
 const r=await exploreStates(a,{mode:'actions',maxActions:3,maxRetries:0,wait:async()=>({reason:'STATE_CHANGED',snapshot:snap()})});
 assert(r.nodes.some(n=>n.key==='variant'));assert(clicks.includes('new-child'));
 assert(!clicks.includes('child'));
});

 test('replay attempts have their own global cap even when no target is clicked',async()=>{
 const h=treeHarness({alwaysFail:true});
 const r=await exploreStates(h.a,{mode:'actions',maxActions:100,maxRetries:5,maxRouteAttempts:2,wait:h.wait});
 assert.equal(r.recovery.routeAttempts,2);assert.equal(r.stopReason,'ROUTE_ATTEMPT_LIMIT');
 assert.equal(h.clicks.length,2);assert.equal(r.pending.length,2);
});

 test('an uncertain click is retried only in a new session and its first evidence survives',async()=>{
 const h=treeHarness();let attempt=0;
 h.a.click=async c=>{h.clicks.push([c.key,++attempt]);throw Object.assign(Error('uncertain'),{code:'ACTION_CLICK_UNCONFIRMED'});};
 const r=await exploreStates(h.a,{mode:'actions',maxRetries:1,maxActions:20,wait:h.wait});
 assert.equal(r.attemptHistory.length,4);assert.equal(r.pending.length,2);assert.equal(r.actions,0);
 assert.equal(r.attemptedActions,4);
});

 test('deadline after observing prevents a late probe and uses the adapter clock',async()=>{
 const h=treeHarness();let probes=0;h.a.afterAction=async()=>{probes++;return {performed:true};};
 const r=await exploreStates(h.a,{mode:'actions',deadline:500,maxRetries:2,wait:async()=>{h.expire();return {snapshot:h.snap(),reason:'QUIET_TIMEOUT'};}});
 assert.equal(h.clicks.length,1);assert.equal(probes,0);assert.equal(r.stopReason,'DEADLINE');
});

 test('a checkpoint that consumes the deadline cannot authorize the following click',async()=>{
 const h=treeHarness();
 const r=await exploreStates(h.a,{mode:'actions',deadline:500,wait:h.wait,onProgress:async p=>{if(p.inFlight)h.expire();}});
 assert.equal(h.clicks.length,0);assert.equal(r.stopReason,'DEADLINE');
});

 test('uncertain capture cannot authorize a stable menu transition',async()=>{
 let t=0;const snap=()=>({key:'menu',controls:[{key:'x'}],inputReady:true,capture:{pending:false,uncertain:true,marker:'idle'}});
 const r=await waitTransition({now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>snap()},{key:'root',traffic:'idle'},{mode:'actions',activeMs:2000,pollMs:500});
 assert.equal(r.reason,'ACTIVE_TIMEOUT');
});

 test('a disabled control is not dispatched even when a stale task lists it',async()=>{
 let reads=0,clicks=0;
 const r=await exploreStates({reset:async()=>{},snapshot:async()=>({key:'root',controls:[{key:'x',enabled:++reads===1}]}),click:async()=>{clicks++;}},{mode:'actions',maxRetries:0,maxActions:1,wait:async a=>({snapshot:await a.snapshot()})});
 assert.equal(clicks,0);assert.equal(r.pending[0].reason,'CONTROL_UNAVAILABLE');
});

 test('a ready newly opened menu is followed without running the spin probe hook',async()=>{
 const h=treeHarness();let probes=0;
 const orig=h.a.snapshot;h.a.snapshot=async()=>({...await orig(),wager:{menuOpen:true}});
 h.a.afterAction=async()=>{probes++;return {performed:false};};
 await exploreStates(h.a,{mode:'actions',maxActions:1,wait:async()=>({snapshot:await h.a.snapshot(),reason:'STATE_CHANGED'})});
 assert.equal(probes,0);
});

function operationHarness({choices=[],advance,choose,pollStep,nextAction='b'}={}) {
 let t=0;const op={sequence:1,kind:'purchase',transaction:{kind:'purchase',complete:true,status:200},protocolComplete:true,nextAction};
 const s={key:'feature',choices,controls:[],traffic:1,operation:op,flags:{canSpin:false},capture:{pending:false},wager:{menuOpen:false}};
 const a={now:()=>t,sleep:async ms=>{t+=pollStep||ms},snapshot:async()=>s,choose:choose|| (async()=>({ok:false})),advance:advance?async()=>advance(()=>{t=20000;}):undefined};
 return {a,s};
}

 test('a failed decision retains every observed option, without claiming the click succeeded',async()=>{
 const {a,s}=operationHarness({choices:[{key:'x'},{key:'y'},{key:'z'}]});
 const r=await finishOperation(a,{operation:{sequence:0}},s,{verifyPurchase:false,timeoutMs:10000});
 assert.equal(r.reason,'CHOICE_ACTION_FAILED');assert.equal(r.decisions.length,1);
 assert.deepEqual(r.decisions[0].options.map(o=>o.key),['x','y','z']);
 assert.equal(r.decisions[0].selected,null);assert.equal(r.decisions[0].attempted,'x');
});

 test('a stale iteration cannot click center after advance overruns its deadline',async()=>{
 let centers=0;const {a,s}=operationHarness({pollStep:5000,advance:expire=>{expire();return {ok:true,kind:'continue'};}});
 a.clickCenter=async()=>{centers++;return {ok:true};};
 await finishOperation(a,{operation:{sequence:0}},s,{verifyPurchase:false,timeoutMs:10000});
 assert.equal(centers,0);
});

 test('no-progress deadline stops repeated continuation polling before the absolute timeout',async()=>{
 const {a,s}=operationHarness({nextAction:'c'});
 const r=await finishOperation(a,{operation:{sequence:0}},s,{verifyPurchase:false,timeoutMs:180000,stallMs:10000});
 assert.equal(r.reason,'OPERATION_STALLED');assert(r.elapsedMs<=10500);assert.equal(r.submission.complete,true);
});

 test('capture pending does not authorize a decision even in strict mode',async()=>{
 let choices=0;const {a,s}=operationHarness({choices:[{key:'x'}],choose:async()=>{choices++;return {ok:true};}});s.capture.pending=true;
 await finishOperation(a,{operation:{sequence:0}},s,{timeoutMs:1000});assert.equal(choices,0);
});

 test('navigation identity excludes transient stage flags, saldo and ordering, not menu or modifier',async()=>{
 const {createNavigationKey}=await import('../providers/pragmatic/state-explorer.js');
 const s={controls:[{key:'a',labels:['BUY']},{key:'b'}],wager:{menuOpen:true,betLevelIndex:0,balance:100},flags:{stages:['StageSpin']}};
 const first=createNavigationKey(s);
 assert.equal(first,createNavigationKey({...s,controls:[...s.controls].reverse(),flags:{stages:['StageResult']},wager:{...s.wager,balance:1000}}));
 assert.notEqual(first,createNavigationKey({...s,wager:{...s.wager,betLevelIndex:1}}));
 assert.notEqual(first,createNavigationKey({...s,wager:{...s.wager,menuOpen:false}}));
 assert.notEqual(first,createNavigationKey({...s,controls:[...s.controls,{key:'new-option'}]}));
});

 test('same picker layout after a new game exchange is a new decision, not a duplicate click',async()=>{
 const {a,s}=operationHarness({choices:[{key:'x'},{key:'y'}]});s.operation.protocolSequence=1;
 let picked=0;a.choose=async()=>{picked++;s.operation.protocolSequence++;if(picked===2){s.choices=[];s.flags.canSpin=true;s.operation.nextAction='s';}return {ok:true};};
 const r=await finishOperation(a,{operation:{sequence:0}},s,{verifyPurchase:false,timeoutMs:5000});
 assert.equal(picked,2);assert.equal(r.decisions.length,2);assert.equal(r.ok,true);
});

 test('observed bonus choices do not depend on provider button names',async()=>{
 const {visibleOperationChoices}=await import('../providers/pragmatic/operation-completion.js');
 const b=path=>({path,name:path,enabled:true,hit_rect:{x:10,y:10,width:20,height:20},handlers:[{kind:'CATButton',index:0}],labels:[]});
 const r=visibleOperationChoices([], [b('old'),b('left'),b('right'),{...b('disabled'),enabled:false}],{fallback:true,excludedPaths:['old']});
 assert.deepEqual(r.map(c=>c.path),['left','right']);assert(r.every(c=>c.physical));
 assert.deepEqual(visibleOperationChoices([], [b('left')]),[],'no generic choice without an explicit operation context');
});

 test('a thrown choice dispatch retains its alternatives without trying another in the same session',async()=>{
 const {a,s}=operationHarness({choices:[{key:'x'},{key:'y'}],choose:async()=>{throw Error('transport uncertain');}});
 const r=await finishOperation(a,{operation:{sequence:0}},s,{verifyPurchase:false,timeoutMs:1000});
 assert.equal(r.reason,'CHOICE_ACTION_FAILED');assert.equal(r.decisions[0].options.length,2);assert.equal(r.decisions[0].selected,null);
});
