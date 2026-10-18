import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGameService,parsePurchases,initProtocol,planOperation,acceptResponse,publicState} from '../providers/pragmatic/protocol-direct.js';
const url='https://demogamesfree.pragmaticplay.net/gs2c/ge/v5/gameService';
const initRequest='action=doInit&symbol=vs10bbveg1000&cver=458647&index=1&counter=1&repeat=0&mgckey=LIVE_FAKE_TOKEN';
const initResponse='index=1&counter=2&na=s&c=0.20&l=10&bl=0&purInit='+encodeURIComponent('[{bet:1000,type:"default"},{bet:4500,type:"default"}]')+'&purInit_e=1,1';
const initialize=()=>initProtocol({url,requestText:initRequest,responseText:initResponse,status:200});
test('HAR fixture: two enabled purchases mapped to stable indices',()=>{
 const state=initialize();
 assert.deepEqual(state.purchases.map(x=>[x.index,x.enabled,x.configuredBet]),[[0,true,1000],[1,true,4500]]);
 assert.equal(publicState(state).mgckey,undefined);
});
test('protocol: doInit -> doSpin/pur=0 -> doCollect increments index/counter exactly as observed',()=>{
 const state=initialize();
 const request=planOperation(state,{action:'doSpin',pur:0});
 assert.equal(request.get('index'),'2');assert.equal(request.get('counter'),'3');
 assert.equal(request.get('pur'),'0');assert.equal(request.get('c'),'0.20');assert.equal(request.get('l'),'10');
 const spin=acceptResponse(state,{status:200,text:'index=2&counter=4&na=c&balance=99998.00',action:'doSpin',pur:0});
 assert.equal(spin.receipt.outcome,'PURCHASE_SPIN_RESPONSE_NOT_BONUS_VERIFIED');
 assert.equal(spin.next.index,3);assert.equal(spin.next.counter,5);
 const collect=planOperation(spin.next,{action:'doCollect'});
 assert.equal(collect.get('index'),'3');assert.equal(collect.get('counter'),'5');
 assert.equal(collect.get('pur'),null);
 const done=acceptResponse(spin.next,{status:200,text:'index=3&counter=6&na=s',action:'doCollect'});
 assert.equal(done.next.na,'s');
});
test('option pur=1 maps to second enabled purchase',()=>{
 const req=planOperation(initialize(),{action:'doSpin',pur:1});
 assert.equal(req.get('pur'),'1');
});
test('does not guess operations after an unknown transition',()=>{
 const state=acceptResponse(initialize(),{status:200,text:'index=2&counter=4&na=fso',action:'doSpin',pur:1}).next;
 assert.throws(()=>planOperation(state,{action:'doCollect'}),/requires na=c/);
 assert.throws(()=>planOperation(state,{action:'doSpin'}),/requires na=s/);
});
test('rejects disabled and unsupported purchase indices',()=>{
 const state=initialize();state.purchases[1].enabled=false;
 assert.throws(()=>planOperation(state,{action:'doSpin',pur:1}),/not enabled/);
 assert.throws(()=>planOperation(state,{action:'doSpin',pur:2}),/not enabled/);
 assert.throws(()=>planOperation(state,{action:'doBonus',pur:0}),/Unmapped/);
});
test('rejects real money, lookalike and missing live keys',()=>{
 for(const host of ['casino.example','demogamesfree.pragmaticplay.net.evil.test']){
  assert.throws(()=>initProtocol({url:'https://'+host+'/gs2c/ge/v5/gameService',requestText:initRequest,responseText:initResponse,status:200}),/DEMO/);
 }
 assert.throws(()=>initProtocol({url,requestText:initRequest.replace('&mgckey=LIVE_FAKE_TOKEN',''),responseText:initResponse,status:200}),/mgckey/);
});
test('invalid, mismatched, error and failed responses do not advance state',()=>{
 const state=initialize();
 for(const props of [
  {status:500,text:'index=2&counter=4&na=c'},
  {status:200,text:'index=3&counter=4&na=c'},
  {status:200,text:'index=2&counter=4&na=c&msg_code=5'},
  {status:200,text:'index=2&counter=4&balance=1'}
 ])assert.throws(()=>acceptResponse(state,{...props,action:'doSpin',pur:0}));
 assert.equal(state.index,2);assert.equal(state.counter,3);
});
test('never interpret absent purchase configuration as available',()=>{
 assert.deepEqual(parsePurchases(parseGameService('index=1&counter=2&na=s')),[]);
 assert.throws(()=>parsePurchases({purInit:'not_json'}));
});
