import test from 'node:test';
import assert from 'node:assert/strict';
import {createProtocolView} from '../integrations/hardfire/protocol-view.js';
import {operationStateFromEntries} from '../providers/pragmatic/operation-completion.js';
const row=(error,full=true)=>({__finalized:true,startedDateTime:'2026-10-06T08:56:10.000Z',request:{url:'https://demogamesfree.pragmaticplay.net/gs2c/ge/v3/gameService',method:'POST',postData:{text:'action=doSpin&index=1'}},response:{status:200,...(error?{_error:error}:{}),content:{text:full?'balance=100&na=s':'',_bodyCaptureStatus:full?'captured':'awaiting-cdp-merge'}}});
const setup=(cdp,web)=>({recording:true,entries:cdp?[cdp]:[],webEntries:web?[web]:[],active:new Map(),webActive:new Map()});
test('net::OK on a completed second observer does not poison the fully captured response',()=>{
 const cdp=row(null),web=row('net::OK',false),r=setup(cdp,web),v=createProtocolView(r,{onDiagnostic:()=>{}})();
 assert.equal(v.entries.length,1);assert.equal(v.pending,false);assert.equal(v.entries[0]._fuzzerPending,false);
 assert.equal(operationStateFromEntries(v.entries).transaction.complete,true);assert.equal(web.response._error,'net::OK');
});
test('a sole complete response with net::OK is normalized without altering raw evidence',()=>{
 const web=row('net::OK'),v=createProtocolView(setup(null,web),{onDiagnostic:()=>{}})();
 assert.equal(v.pending,false);assert(!v.entries[0].response._error);assert.equal(operationStateFromEntries(v.entries).transaction.complete,true);assert.equal(web.response._error,'net::OK');
});
for(const error of ['net::ERR_ABORTED','net::ERR_FAILED','Network request failed','net::OK extra'])test('a real or unknown error is not hidden by its complete counterpart: '+error,()=>{
 const v=createProtocolView(setup(row(null),row(error,false)),{onDiagnostic:()=>{}})();assert.equal(v.pending,true);assert.equal(v.entries[0]._fuzzerPending,true);assert.equal(operationStateFromEntries(v.entries).transaction.complete,false);
});
test('net::OK alone does not replace missing body or pending transport',()=>{
 const r=setup(null,row('net::OK',false));assert.equal(createProtocolView(r,{onDiagnostic:()=>{}})().pending,true);
 const cdp=row(null),web=row('net::OK');web.__finalized=false;const r2=setup(cdp,null);r2.webActive.set('1',web);assert.equal(createProtocolView(r2,{onDiagnostic:()=>{}})().pending,true);
});
