import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuidedExplorer} from '../providers/pragmatic/guided-explorer.js';
const button=(key,name=key)=>({key,name,path:name,handlers:[],fingerprint:'fp-'+key,
 labels:[name],sprite_names:[],clickable:'RUNTIME_COLLIDER'});
const wait=async(a)=>({snapshot:await a.snapshot(),reason:'STATE_CHANGED'});

function demo(){
 let state='root',sequence=0,sessions=0,clicks=[],center=0,spins=0,picks=[];
 const ui={root:[button('buy-menu','Buy Feature Menu')],menu:[button('buy-80','Buy Free Spins 80x'),
  button('buy-200','Buy Free Spins 200x'),button('close','Cancel')],bonus:[]};
 const a={reset:async()=>{state='root';sequence=0;sessions++;},
  snapshot:async()=>({key:state,controls:ui[state]||[],choices:state==='pick'?[{key:'choice-A',event:'pick'}]:[],
   flags:{canSpin:state==='root'},wager:{menuOpen:state==='menu'},operation:{sequence},
   evidence:{tab_id:55,full_path:'game.jpg',artifact_dir:'fixture'}}),
  click:async b=>{clicks.push(b.key);if(b.key==='buy-menu')state='menu';else if(b.key.startsWith('buy-')){state='bonus';sequence++;}else if(b.key==='close')state='root';},
  choose:async p=>{picks.push(p.key);state='root';return {ok:true};},
  spinNormal:async()=>{spins++;sequence++;return {ok:true};},
  clickCenter:async()=>{center++;state='root';return {ok:true};}
 };
 return {a,metrics:()=>({state,sequence,sessions,clicks,center,spins,picks}),setState:x=>{state=x;},setSeq:x=>{sequence=x;}};
}

test('observe never clicks: model explicitly selects filtered buy menu and purchase',async()=>{
 const d=demo(),g=createGuidedExplorer(d.a,{wait,maxSessions:4});
 const root=await g.start();assert.equal(d.metrics().clicks.length,0);
 assert(root.actions.some(a=>a.kind==='button'&&a.key==='buy-menu'));
 assert.equal(root.screenshot,'game.jpg');
 assert.equal((await g.act({token:root.token,action_id:'wrong'})).status,'INVALID_DECISION');
 assert.equal(d.metrics().clicks.length,0);
 const open=root.actions.find(a=>a.key==='buy-menu');
 const result=await g.act({token:root.token,action_id:open.action_id});
 assert.equal(result.status,'DECISION_EXECUTED');assert.deepEqual(d.metrics().clicks,['buy-menu']);
 const firstBuy=result.view.actions.find(a=>a.key==='buy-80');
 assert(firstBuy);assert.equal(result.view.wager.menuOpen,true);
 const bought=await g.act({token:result.view.token,action_id:firstBuy.action_id});
 assert.equal(bought.status,'DECISION_EXECUTED');
 assert.deepEqual(d.metrics().clicks,['buy-menu','buy-80']);
 assert.equal(d.metrics().spins,0);assert.equal(d.metrics().center,0);
 assert.equal(d.metrics().sessions,1);
 assert.equal(bought.view.operation.sequence,1);
 assert.equal((await g.act({token:result.view.token,action_id:firstBuy.action_id})).status,'STALE_DECISION');
 assert.equal(d.metrics().clicks.length,2);
});
test('changed state aborts action without clicking',async()=>{
 const d=demo(),g=createGuidedExplorer(d.a,{wait});
 const root=await g.start();d.setState('menu');
 const b=root.actions.find(x=>x.key==='buy-menu');
 const result=await g.act({token:root.token,action_id:b.action_id});
 assert.equal(result.status,'STATE_CHANGED');assert.deepEqual(d.metrics().clicks,[]);
 assert(result.view.actions.some(x=>x.key==='buy-80'));
});
test('changed fingerprint aborts stale action',async()=>{
 const d=demo(),g=createGuidedExplorer(d.a,{wait});
 const root=await g.start();
 const orig=d.a.snapshot;
 d.a.snapshot=async()=>{const s=await orig();return {...s,controls:s.controls.map(b=>({...b,fingerprint:'different'}))};};
 const r=await g.act({token:root.token,action_id:root.actions.find(a=>a.kind==='button').action_id});
 assert.equal(r.status,'CONTROL_CHANGED');assert.equal(d.metrics().clicks.length,0);
});
test('active picker is a deliberate decision; never chosen automatically',async()=>{
 const d=demo();d.setState('pick');
 const g=createGuidedExplorer(d.a,{wait});
 const v=await g.start(); // start resets to root
 d.setState('pick');
 const picker=await g.observe();
 assert(picker.actions.some(a=>a.kind==='picker'));
 assert.deepEqual(d.metrics().picks,[]);
 const select=picker.actions.find(a=>a.kind==='picker');
 const result=await g.act({token:picker.token,action_id:select.action_id});
 assert.equal(result.status,'DECISION_EXECUTED');assert.deepEqual(d.metrics().picks,['choice-A']);
});
test('skip records untested button without clicking; only explicit reset spends session',async()=>{
 const d=demo(),g=createGuidedExplorer(d.a,{wait,maxSessions:3});
 const r=await g.start();
 const b=r.actions.find(a=>a.kind==='button');
 const skipped=await g.skip({token:r.token,action_id:b.action_id});
 assert.equal(skipped.status,'SKIPPED_WITHOUT_CLICK');assert.equal(skipped.view.actions.filter(x=>x.kind==='button').length,0);
 assert.deepEqual(d.metrics().clicks,[]);assert.equal(d.metrics().sessions,1);
 await g.reset();await g.reset();const limit=await g.reset();
 assert.equal(limit.status,'SESSION_LIMIT');assert.equal(d.metrics().sessions,3);
 assert.equal((await g.close()).status,'CLOSED');
});
test('continue center is offered as visually-gated action and never auto-fired on wait',async()=>{
 const d=demo(),g=createGuidedExplorer(d.a,{wait});
 await g.start();d.setState('bonus');const v=await g.observe();
 assert(v.actions.some(x=>x.action_id==='continue_center'&&x.risk==='UNVERIFIED_OVERLAY'));
 assert.equal(d.metrics().center,0);
 const result=await g.act({token:v.token,action_id:'continue_center'});
 assert.equal(result.status,'DECISION_EXECUTED');assert.equal(d.metrics().center,1);
});

test('provider continuation and model rationale only run after explicit selection',async()=>{
 const d=demo(),events=[];
 const orig=d.a.snapshot;
 d.a.snapshot=async arg=>{const s=await orig(arg);return {...s,
  operation:{...s.operation,protocolComplete:s.key==='bonus'}};};
 d.a.advance=async()=>{d.setState('root');return {ok:true,kind:'provider-continue'};};
 const g=createGuidedExplorer(d.a,{wait,onRecord:async r=>events.push(r.history.at(-1))});
 await g.start();d.setState('bonus');
 const v=await g.observe();assert(v.actions.some(a=>a.action_id==='advance_protocol'));
 assert.equal(events.length,0);
 const result=await g.act({token:v.token,action_id:'advance_protocol',reason:'Provider completion pending; selected controlled continue'});
 assert.equal(result.status,'DECISION_EXECUTED');
 assert.equal(events[0].decision_reason,'Provider completion pending; selected controlled continue');
 assert.deepEqual(d.metrics().clicks,[]);
});
