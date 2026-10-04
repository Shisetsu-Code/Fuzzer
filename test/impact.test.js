import test from 'node:test';import assert from 'node:assert/strict';import {classifyImpact} from '../providers/pragmatic/impact.js';
test('round trip rejects counters and records observed purchase multipliers',()=>{
 const snapshots=[.2,.4,.6,.4,.2].map((bet,i)=>({bet,variables:{opaque:{GetDouble:bet},counter:{GetInt:i}},options:[{id:'buy:0',cost:bet*100}]}));
 const r=classifyImpact(snapshots);assert.equal(r.roundTripVerified,true);assert.equal(r.affected.find(x=>x.path==='purchase.buy:0.cost').formula.factor,100);assert.equal(r.affected.find(x=>x.path.includes('counter')).classification,'TRANSIENT');assert.equal(r.affected[0].causalityConfirmed,false);
});
test('a failed restoration cannot establish a multiplier',()=>{
 const r=classifyImpact([1,2,3,2,2].map(bet=>({bet,variables:{x:{GetDouble:bet}}})));assert.equal(r.roundTripVerified,false);assert.equal(r.affected[0].formula,null);
});
