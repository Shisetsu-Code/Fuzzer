import test from 'node:test';import assert from 'node:assert/strict';
import {finishOperation} from '../providers/pragmatic/operation-completion.js';

function operationHarness({choices=[],advance,choose,pollStep}={}) {
 let t=0;const op={sequence:1,kind:'purchase',transaction:{kind:'purchase',complete:true,status:200},protocolComplete:true,nextAction:'b'};
 const s={key:'feature',choices,controls:[],traffic:1,operation:op,flags:{canSpin:false},capture:{pending:false},wager:{menuOpen:false}};
 const a={now:()=>t,sleep:async ms=>{t+=pollStep||ms},snapshot:async()=>s,choose:choose|| (async()=>({ok:false})),advance:advance?async()=>advance(()=>{t=20000;}):undefined};
 return {a,s};
}

test('a completed choice request and visible choices can proceed above a stale StageSpin',async()=>{
 let picked=0;const {a,s}=operationHarness({choices:[{key:'x'},{key:'y'}]});s.flags.stages=['StageSpin'];
 a.choose=async()=>{picked++;s.choices=[];s.flags={canSpin:true,stages:[]};s.operation.nextAction='s';return {ok:true};};
 const result=await finishOperation(a,{operation:{sequence:0}},s,{verifyPurchase:false,timeoutMs:3000});
 assert.equal(picked,1);assert.equal(result.ok,true);
});
test('a stale spin-stage panel without a completed choice request cannot trigger selection',async()=>{
 let picked=0;const {a,s}=operationHarness({choices:[{key:'x'}],choose:async()=>{picked++;return {ok:true};}});s.flags.stages=['StageSpin'];s.operation.protocolComplete=false;
 await finishOperation(a,{operation:{sequence:0}},s,{verifyPurchase:false,timeoutMs:1500});assert.equal(picked,0);
});
test('hiding and reappearing old choices does not rearm their click without protocol progress',async()=>{
 let t=0,picked=0;
 const snap=()=>({choices:t===500?[]:[{key:'x'}],flags:{canSpin:false},capture:{pending:false},wager:{menuOpen:false},traffic:1,operation:{sequence:1,protocolSequence:1,kind:'purchase',transaction:{complete:true,status:200},protocolComplete:true,nextAction:'b'}});
 const a={now:()=>t,sleep:async ms=>{t+=ms},snapshot:async()=>snap(),choose:async()=>{picked++;return {ok:true};}};
 await finishOperation(a,{operation:{sequence:0}},snap(),{verifyPurchase:false,timeoutMs:2000});assert.equal(picked,1);
});

test('completed response permits the observed Stop recovery during StageSpin in action mode',async()=>{
 let advanced=0;const {a,s}=operationHarness();s.flags={canSpin:false,stopActive:true,stages:['StageSpin']};
 a.advance=async()=>{advanced++;s.flags={canSpin:true,stopActive:false,stages:[]};s.operation.nextAction='s';return {ok:true,clicked:true,kind:'OBSERVED_STOP'};};
 const result=await finishOperation(a,{operation:{sequence:0}},s,{verifyPurchase:false,timeoutMs:5000});
 assert.equal(advanced,1);assert.equal(result.ok,true);
});
