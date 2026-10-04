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

