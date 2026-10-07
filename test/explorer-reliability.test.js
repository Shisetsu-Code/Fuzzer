import test from 'node:test';
import assert from 'node:assert/strict';
import {exploreStates} from '../providers/pragmatic/state-explorer.js';
import {filterKnownControls} from '../providers/pragmatic/known-controls.js';

test('active timeout retains a changed empty screen as pending evidence',async()=>{
 let state='root',probes=0;
 const snapshot=()=>({key:state,controls:state==='root'?[{key:'open'}]:[],evidence:{full_path:'last-screen.jpg'}});
 const adapter={reset:async()=>{state='root'},snapshot:async()=>snapshot(),click:async()=>{state='loading'},afterAction:async()=>{probes++;return null}};
 const result=await exploreStates(adapter,{wait:async()=>({snapshot:snapshot(),reason:'ACTIVE_TIMEOUT'})});
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.pending[0].reason,'ACTIVE_TIMEOUT');
 assert.equal(result.pending[0].evidence.full_path,'last-screen.jpg');
 assert.equal(probes,0,'an unsettled transition cannot authorize a follow-up spin');
 assert.equal(result.nodes.length,1,'the transient screen is not a verified route');
});

test('replay reaching the expected key through an active timeout cannot execute its child',async()=>{
 let state='root',opens=0;const clicked=[];
 const snapshot=()=>({key:state,controls:state==='root'?[{key:'open'}]:state==='menu'?[{key:'buy'}]:[],evidence:{full_path:'replay.jpg'}});
 const adapter={reset:async()=>{state='root'},snapshot:async()=>snapshot(),click:async control=>{clicked.push(control.key);if(control.key==='open'){opens++;state='menu'}else state='done'}};
 const result=await exploreStates(adapter,{wait:async()=>({snapshot:snapshot(),reason:opens>1?'ACTIVE_TIMEOUT':'STATE_CHANGED'})});
 assert.deepEqual(clicked,['open','open']);
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.pending[0].reason,'ACTIVE_TIMEOUT');
 assert.equal(result.pending[0].phase,'replay');
 assert.equal(result.pending[0].observed,'menu');
});

test('a visible feature with no projected hit area stays pending and is never clicked',async()=>{
 const feature={path:'Game/BonusBuy',name:'BonusBuy',drawn_rect:{x:10,y:10,width:100,height:30},hit_rect:null,clickable:'UNKNOWN'};
 const partition=filterKnownControls([feature],{requireHitRect:true});
 assert.deepEqual(partition.keep,[]);
 let clicks=0;
 const adapter={reset:async()=>{},snapshot:async()=>({key:'root',controls:partition.keep,unresolved:partition.unresolved,evidence:{full_path:'feature.jpg'}}),click:async()=>{clicks++}};
 const result=await exploreStates(adapter);
 assert.equal(clicks,0);assert.equal(result.status,'PARTIAL');
 assert.equal(result.pending[0].action,'Game/BonusBuy');
 assert.equal(result.pending[0].reason,'UNRESOLVED_HIT_AREA');
 assert.equal(result.pending[0].evidence.full_path,'feature.jpg');
});

test('hit-area validation preserves usable features and still discards known base controls',()=>{
 const feature={path:'Game/BonusBuy',name:'BonusBuy',hit_rect:{x:10,y:10,width:100,height:30}};
 const spin={path:'GUI/StartSpin_Button',name:'StartSpin_Button',hit_rect:null};
 const invalid=[null,{x:0,y:0,width:0,height:10},{x:NaN,y:0,width:10,height:10},{x:0,y:0,width:10,height:-1}];
 const partition=filterKnownControls([feature,spin,...invalid.map((hit_rect,i)=>({path:'Game/Unknown'+i,name:'Unknown'+i,hit_rect}))],{requireHitRect:true});
 assert.deepEqual(partition.keep,[feature]);
 assert.equal(partition.discarded[0].discard_reason,'spin');
 assert.equal(partition.unresolved.length,4);
 assert.deepEqual(filterKnownControls([{path:'Game/Unknown',hit_rect:null}]).keep,[{path:'Game/Unknown',hit_rect:null}],'inspection without a click requirement preserves its existing output');
});

test('a reset cleanup failure halts exploration and preserves every unattempted action',async()=>{
 let state='root',resets=0;const clicked=[];
 const adapter={reset:async()=>{resets++;if(resets>1)throw Object.assign(new Error('HAR write failed'),{code:'SESSION_CLEANUP_FAILED',cleanupError:'HAR write failed',retainedTabIds:[42]});state='root'},snapshot:async()=>({key:state,controls:state==='root'?[{key:'a'},{key:'b'},{key:'c'}]:[]}),click:async control=>{clicked.push(control.key);state='done'}};
 const result=await exploreStates(adapter,{wait:async a=>({snapshot:await a.snapshot(),reason:'STATE_CHANGED'})});
 assert.equal(resets,2,'a retained tab must stop further reset attempts');
 assert.deepEqual(clicked,['a']);
 assert.equal(result.status,'PARTIAL');
 assert.deepEqual(result.retainedTabIds,[42]);
 assert.match(result.cleanupError,/HAR write failed/);
 assert.deepEqual(result.pending.map(p=>[p.action,p.reason]),[['b','SESSION_CLEANUP_FAILED'],['c','SESSION_CLEANUP_FAILED']]);
});
