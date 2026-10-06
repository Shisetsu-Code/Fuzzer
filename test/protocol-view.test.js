import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../integrations/hardfire/protocol-view.js').catch(()=>({}));
const url='https://demogamesfree.pragmaticplay.net/gs2c/ge/v3/gameService';
const entry=(body='action=doSpin&index=1',time=0)=>({startedDateTime:new Date(time).toISOString(),__finalized:false,request:{url,method:'POST',postData:{text:body}},response:{status:0,content:{text:''}}});
const recorder=()=>({entries:[],webEntries:[],active:new Map(),webActive:new Map(),recording:true});
const view=r=>{assert.equal(typeof api.createProtocolView,'function');return api.createProtocolView(r);};
const done=e=>{e.__finalized=true;e.response={status:200,content:{text:'balance=100&na=s'}};return e;};
test('live view retains an active request and its identity after finalization',()=>{
 const r=recorder(),e=entry();r.active.set('1',e);const v=view(r),a=v();
 assert.equal(a.entries.length,1);assert.equal(a.pending,true);
 done(e);r.active.delete('1');r.entries.push(e);const b=v();
 assert.equal(b.entries.length,1);assert.equal(b.pending,false);assert.equal(a.entries[0]._fuzzerRequestId,b.entries[0]._fuzzerRequestId);
});
test('background bodies and event counters do not change the protocol marker',()=>{
 const r=recorder(),v=view(r),first=v();r.entries.push({...entry(),request:{url:'https://example.com/metrics',method:'POST'}});r.pendingBodies=new Set([Promise.resolve()]);r.cdpEvents=999;
 assert.equal(v().marker,first.marker);assert.equal(v().pending,false);
});
test('CDP and webRequest observations of the same request count once',()=>{
 const r=recorder(),c=entry(),w=entry();r.active.set('1',c);r.webActive.set('w',w);const v=view(r);
 assert.equal(v().entries.length,1);const id=v().entries[0]._fuzzerRequestId;
 done(c);done(w);r.active.clear();r.webActive.clear();r.entries.push(c);r.webEntries.push(w);
 const s=v();assert.equal(s.entries.length,1);assert.equal(s.pending,false);assert.equal(s.entries[0]._fuzzerRequestId,id);
});
test('a delayed duplicate observation cannot manufacture a second operation',()=>{
 const r=recorder(),w=done(entry()),v=view(r);r.webEntries.push(w);const id=v().entries[0]._fuzzerRequestId;
 r.entries.push(done(entry()));const s=v();assert.equal(s.entries.length,1);assert.equal(s.entries[0]._fuzzerRequestId,id);
});
test('identical requests from the same source remain separate',()=>{
 const r=recorder();r.entries.push(done(entry()),done(entry()));const s=view(r)();assert.equal(s.entries.length,2);assert.notEqual(s.entries[0]._fuzzerRequestId,s.entries[1]._fuzzerRequestId);
});
test('missing request data and incomplete response data block another input',()=>{
 const r=recorder(),e=entry();delete e.request.postData;e.request._postDataCaptureStatus='pending';r.active.set('1',e);const v=view(r);assert.equal(v().pending,true);
 e.request.postData={text:'action=doSpin&index=1'};e.request._postDataCaptureStatus='captured-cdp';e.__finalized=true;e.response.status=200;e.response.content._bodyCaptureStatus='pending';
 assert.equal(v().pending,true);e.response.content.text='na=s';e.response.content._bodyCaptureStatus='captured';assert.equal(v().pending,false);
});
test('ambiguously paired identical requests remain uncertain rather than silently disappearing',()=>{
 const r=recorder();r.entries.push(done(entry()),done(entry()));r.webEntries.push(done(entry()));const s=view(r)();assert.equal(s.pending,true);assert.equal(s.uncertain,true);
});
test('the marker distinguishes equal length response updates without exposing credentials',()=>{
 const r=recorder(),e=done(entry('action=doSpin&mgckey=secret&index=1'));r.entries.push(e);const v=view(r),a=v();e.response.content.text='balance=200&na=s';const b=v();assert.notEqual(a.marker,b.marker);assert(!b.marker.includes('secret'));
});
test('capture stopped unexpectedly cannot authorize another click',()=>{
 const r=recorder();r.entries.push(done(entry()));const v=view(r);assert.equal(v().pending,false);r.recording=false;assert.equal(v().pending,true);
});
test('late request body disagreement makes the paired evidence uncertain',()=>{
 const r=recorder(),c=entry(),w=entry();delete w.request.postData;r.active.set('c',c);r.webActive.set('w',w);const v=view(r);v();
 w.request.postData={text:'action=doSpin&index=2'};done(w);done(c);const s=v();assert.equal(s.pending,true);assert.equal(s.uncertain,true);
});
