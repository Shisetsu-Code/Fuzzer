import test from 'node:test';
import assert from 'node:assert/strict';
import {runPragmatic, compareEconomics} from '../providers/pragmatic/flow.js';

function fixture(states) {
  let index=0; const actions=[];
  return {actions, async observe(){return states[index];}, async perform(action){actions.push(action); index++; return {ok:true};},
    async waitForTransition(){return true;}, async capture(){return {requests:[{action:'doSpin',pur:'0'}]};}, async close(){},
    async forkDemo(){return fixture(states);}, async economics(){return {bet:1,options:[]};}, async changeBet(){return {ok:false};}};
}
const base={phase:'base',terminal:true,options:[],inventoryKnown:true};
test('a terminal ante branch reuses its confirmed normal rounds without sending extra verification spins',async()=>{
 const ante={id:'ante:1',kind:'modifier'};let performed=false;
 const child={observe:async()=>performed?base:{...base,options:[ante]},perform:async()=>{performed=true;return {ok:true,normalRoundsVerified:true};},capture:async()=>({}),waitForTransition:async()=>true,verifyBase:async()=>{assert.fail('extra verification can start an unrelated natural bonus');},close:async()=>{}};
 const result=await runPragmatic({observe:async()=>({...base,options:[ante]}),forkDemo:async()=>child});
 assert.equal(result.status,'COMPLETE');assert.equal(result.tree[0].steps.length,1);
});
test('an unverified modifier still requires terminal verification',async()=>{
 const ante={id:'ante:1',kind:'modifier'};let performed=false;
 const child={observe:async()=>performed?base:{...base,options:[ante]},perform:async()=>{performed=true;return {ok:true,normalRoundsVerified:false};},capture:async()=>({}),waitForTransition:async()=>true,verifyBase:async()=>false,close:async()=>{}};
 const result=await runPragmatic({observe:async()=>({...base,options:[ante]}),forkDemo:async()=>child});
 assert.equal(result.status,'PARTIAL');assert.equal(result.tree[0].reason,'RETURN_TO_BASE_UNCONFIRMED');
});
test('a natural bonus started by terminal verification is continued before the branch is certified',async()=>{
 const buy={id:'buy:0',kind:'buy'};let stage='entry',checks=0;
 const feature={phase:'feature',terminal:false,options:[],continueAction:{id:'bonus:continue',kind:'continue'}};
 const child={observe:async()=>stage==='entry'?{...base,options:[buy]}:stage==='bonus'?feature:base,
 perform:async action=>{stage=action.kind==='buy'?'base':'finished';return {ok:true};},capture:async()=>({}),waitForTransition:async()=>true,
 verifyBase:async()=>{checks++;if(checks===1){stage='bonus';return false;}return true;},close:async()=>{}};
 const result=await runPragmatic({observe:async()=>({...base,options:[buy]}),forkDemo:async()=>child});
 assert.equal(result.status,'COMPLETE');assert.deepEqual(result.tree[0].steps.map(s=>s.action.kind),['buy','continue']);assert.equal(checks,2);
});
test('random bonus choices are left explicit rather than added as unreplayable purchase paths',async()=>{
 const buy={id:'buy:0',kind:'buy'};let stage='entry';
 const child={observe:async()=>stage==='entry'?{...base,options:[buy]}:stage==='bonus'?{phase:'choice',terminal:false,options:[{id:'pick:0',kind:'pick'}]}:base,
 perform:async()=>{stage='base';return {ok:true};},capture:async()=>({}),waitForTransition:async()=>true,
 verifyBase:async()=>{stage='bonus';return false;},close:async()=>{}};
 const result=await runPragmatic({observe:async()=>({...base,options:[buy]}),forkDemo:async()=>child});
 assert.equal(result.status,'PARTIAL');assert.equal(result.tree[0].reason,'NATURAL_BONUS_CHOICE_REQUIRED');assert.equal(result.tree.length,1);assert.equal(result.graph.nodes.some(n=>n.kind==='pick'),false);
});
test('a picker revealed after continuing a natural verification bonus is not scheduled for replay',async()=>{
 const buy={id:'buy:0',kind:'buy'};let stage='entry';
 const child={observe:async()=>stage==='entry'?{...base,options:[buy]}:stage==='bonus'?{phase:'feature',terminal:false,options:[],continueAction:{id:'continue',kind:'continue'}}:stage==='picker'?{phase:'choice',terminal:false,options:[{id:'pick:0',kind:'pick'}]}:base,
 perform:async action=>{stage=action.kind==='buy'?'base':'picker';return {ok:true};},capture:async()=>({}),waitForTransition:async()=>true,
 verifyBase:async()=>{stage='bonus';return false;},close:async()=>{}};
 const result=await runPragmatic({observe:async()=>({...base,options:[buy]}),forkDemo:async()=>child});
 assert.equal(result.tree[0].reason,'NATURAL_BONUS_CHOICE_REQUIRED');assert.equal(result.tree.length,1);assert.equal(result.graph.nodes.some(n=>n.kind==='pick'),false);
});
test('keeps purchase and nested choices in their respective branches',async()=>{
 const s=fixture([{phase:'base',options:[{id:'buy:0',kind:'buy',index:0}],inventoryKnown:true},
 {phase:'choice',options:[{id:'pick:0',kind:'pick'},{id:'pick:1',kind:'pick'}]},base]);
 const r=await runPragmatic(s,{maxBranches:8,maxSteps:8});
 assert.equal(r.tree[0].status,'EXPANDED'); const leaves=r.tree.filter(b=>b.status!=='EXPANDED'); assert.equal(leaves.length,2); assert.deepEqual(leaves.map(b=>b.path),[['buy:0','pick:0'],['buy:0','pick:1']]);
 assert.ok(leaves.every(b=>b.status==='COMPLETE'));
});
test('unknown inventory is pending rather than confirmed absent',async()=>{
 const r=await runPragmatic(fixture([{...base,inventoryKnown:false}]),{});
 assert.equal(r.status,'PARTIAL'); assert.equal(r.buyFeaturePresence,'UNKNOWN');
});
test('unknown continuation does not invent a click',async()=>{
 const s=fixture([{phase:'base',inventoryKnown:true,options:[{id:'buy:0',kind:'buy'}]}, {phase:'unknown',options:[]}]);
 const r=await runPragmatic(s,{}); assert.equal(r.status,'PARTIAL'); assert.deepEqual(s.actions,[]);
 assert.equal(r.tree[0].status,'PENDING');
});
test('comparison retains non proportional costs and does not infer missing prices',()=>{
 const r=compareEconomics({bet:1,options:[{id:'a',cost:10},{id:'b',cost:null}]},{bet:2,options:[{id:'a',cost:25},{id:'b',cost:null}]});
 assert.equal(r.options[0].proportional,false); assert.equal(r.options[1].proportional,null);
});
test('step limit never certifies an open bonus',async()=>{
 const s=fixture([{phase:'base',inventoryKnown:true,options:[{id:'buy:0',kind:'buy'}]}, {phase:'feature',continueAction:{id:'continue',kind:'continue'}},base]);
 const r=await runPragmatic(s,{maxSteps:1}); assert.equal(r.status,'PARTIAL');
});
test('discovers and executes seventeen purchases without a fixed default branch count',async()=>{
 const r=await runPragmatic(fixture([{phase:'base',inventoryKnown:true,options:Array.from({length:17},(_,index)=>({id:'buy:'+index,kind:'buy',index}))},base]));
 assert.equal(r.tree.length,17);assert.equal(r.status,'COMPLETE');assert.equal(r.graph.nodes.filter(n=>n.kind==='buy').length,17);
});
test('nested menus with more choices take priority over a provisional terminal flag',async()=>{
 const r=await runPragmatic(fixture([{phase:'base',inventoryKnown:true,options:[{id:'buy:0',kind:'buy'}]},
 {phase:'choice',terminal:true,options:Array.from({length:5},(_,i)=>({id:'nested:'+i,kind:'nested_buy'}))},base]));
 assert.equal(r.tree.length,6);assert.equal(r.graph.nodes.filter(n=>n.kind==='nested_buy').length,5);assert.equal(r.status,'COMPLETE');
});
test('a safety budget retains every discovered unexecuted option in the graph',async()=>{
 const r=await runPragmatic(fixture([{phase:'base',inventoryKnown:true,options:Array.from({length:7},(_,index)=>({id:'buy:'+index,kind:'buy'}))},base]),{maxBranches:2});
 assert.equal(r.status,'PARTIAL');assert.equal(r.pendingPaths.length,5);assert.equal(r.graph.nodes.filter(n=>n.kind==='buy').length,7);assert.equal(r.coverage.graphComplete,false);
});
test('new options discovered while replaying a prefix are also scheduled',async()=>{
 const options=[{id:'buy:0',kind:'buy'},{id:'buy:1',kind:'buy'}];
 const s={observe:async()=>({phase:'base',inventoryKnown:true,options:options.slice(0,1)}),forkDemo:async()=>fixture([{phase:'base',inventoryKnown:true,options},base])};
 const r=await runPragmatic(s);assert.equal(r.tree.length,2);assert.equal(r.inventory.length,2);assert.equal(r.coverage.rootPurchasesDiscovered,2);assert.equal(r.status,'COMPLETE');
});
test('purchase presence follows the updated root inventory rather than its initial snapshot',async()=>{
 const options=[{id:'ante',kind:'modifier'},{id:'buy:0',kind:'buy'}];
 const s={observe:async()=>({phase:'base',inventoryKnown:true,options:options.slice(0,1)}),forkDemo:async()=>fixture([{phase:'base',inventoryKnown:true,options},base])};
 const r=await runPragmatic(s);assert.equal(r.buyFeaturePresence,'PRESENT');assert.equal(r.coverage.rootPurchasesDiscovered,1);
});

