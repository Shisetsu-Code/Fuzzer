import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {HarStore,listEntries,readExchange} from '../har/store.js';
import {normalizeExchange} from '../har/normalize.js';

const entry=(text='action=doSpin&symbol=fixture')=>({request:{url:'https://demo.invalid/gameService',method:'POST',postData:{mimeType:'application/x-www-form-urlencoded',text}},response:{status:200,content:{mimeType:'application/json',text:'{"ok":true}'}}});
async function fixture(t,har,{bom=false}={}){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'har space '));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'capture with spaces.har');await fs.writeFile(file,(bom?'\ufeff':'')+JSON.stringify(har));return file;}
test('open validates HAR, accepts UTF8 BOM and Windows spaces, preserves indices and closes',async t=>{
 const store=new HarStore(),file=await fixture(t,{log:{version:'1.2',entries:[entry(),entry('action=doCollect')] }},{bom:true});
 const summary=await store.open(file);assert.equal(summary.entries,2);assert.deepEqual(summary.domains,['demo.invalid']);
 const capture=store.get(summary.har_id),page=listEntries(capture,{filters:{action:'doCollect'}});assert.equal(page.total,1);assert.equal(page.items[0].entry_index,1);assert.equal(page.items[0].request.body,undefined);
 assert.equal(store.close(summary.har_id).closed,true);assert.throws(()=>store.get(summary.har_id),/UNKNOWN_HAR/);
 await fs.writeFile(file,'{"log":{"entries":"wrong"}}');await assert.rejects(store.open(file),/INVALID_HAR/);
});
test('capacity and byte limits reject and failed open does not consume capacity',async t=>{
 const file=await fixture(t,{log:{entries:[entry()]}});await assert.rejects(new HarStore({maxBytes:20}).open(file),/HAR_TOO_LARGE/);
 const store=new HarStore({maxFiles:1});await assert.rejects(store.open(file+'.missing'),/HAR_READ_FAILED/);await store.open(file);await assert.rejects(store.open(file),/HAR_CAPACITY/);
});
test('pagination and fragment limits validate and report truncation',()=>{
 const capture={entries:Array.from({length:220},()=>entry())};assert.equal(listEntries(capture).items.length,50);assert.equal(listEntries(capture,{limit:200}).items.length,200);
 assert.throws(()=>listEntries(capture,{offset:-1}),/INVALID_ARGUMENT/);assert.throws(()=>listEntries(capture,{limit:201}),/INVALID_ARGUMENT/);
 const e=readExchange(capture,0,{section:'request',limit:10});assert.equal(e.request.body.text.length,10);assert.equal(e.truncated,true);assert.equal(e.response,undefined);
 assert.throws(()=>readExchange(capture,999),/INVALID_ENTRY/);assert.throws(()=>readExchange(capture,0,{limit:16385}),/INVALID_ARGUMENT/);
});
test('JSON, forms, duplicate query fields and base64 decode without inventing binary or missing bodies',()=>{
 const e=entry();e.request.url+='?x=1&x=2';e.request.postData.text='action=doSpin&bl=1';e.response.content.text=Buffer.from('{"mode":2}').toString('base64');e.response.content.encoding='base64';
 const capture={entries:[e]},n=normalizeExchange(capture,0);assert.deepEqual(n.request.query.x,['1','2']);assert.equal(n.request.fields.bl,'1');assert.equal(n.response.fields.mode,2);
 e.response.content={mimeType:'image/png',text:'AA==',encoding:'base64'};assert.equal(normalizeExchange(capture,0).response.body.status,'BINARY');
 delete e.response.content;assert.equal(normalizeExchange(capture,0).response.body.status,'MISSING');
});
test('consolidated body references verify hashes and reject cycles',()=>{
 const first=entry(),second=entry();second.response.content={text:'',_bodyReference:{entry:0,sha256:createHash('sha256').update(first.response.content.text).digest('hex')}};
 const c={entries:[first,second]};assert.equal(normalizeExchange(c,1).response.fields.ok,true);
 second.response.content._bodyReference.sha256='bad';assert.ok(normalizeExchange(c,1).warnings.includes('BODY_REFERENCE_HASH_MISMATCH'));
 first.response.content={text:'',_bodyReference:{entry:1}};second.response.content._bodyReference={entry:0};assert.ok(normalizeExchange(c,0).warnings.includes('BODY_REFERENCE_CYCLE'));
});
test('incomplete capture markers, invalid entry shapes and bounded summary are explicit',async t=>{
 const file=await fixture(t,{log:{entries:[entry()],_captureIncomplete:{reason:'timeout'}}});const summary=await new HarStore().open(file);assert.ok(summary.warnings.includes('CAPTURE_INCOMPLETE'));
 await fs.writeFile(file,JSON.stringify({log:{entries:[null]}}));await assert.rejects(new HarStore().open(file),/INVALID_HAR/);
});
