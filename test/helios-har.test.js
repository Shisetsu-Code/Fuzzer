import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PragmaticSession,parseInit} from '../providers/pragmatic/session.js';
const entries=JSON.parse(await fs.readFile(new URL('./fixtures/helios-manual-sanitized.json',import.meta.url),'utf8')).log.entries;
const frameState={canSpin:true,logicIsFreeSpin:false};

test('Helios doInit proves two purchase multipliers and the ante scale without secrets',()=>{
 const text=entries[0].response.content.text,init=parseInit(text),fields=new URLSearchParams(text);
 const baseLines=Number(fields.get('l')),scales=fields.get('bls').split(',').map(Number);
 assert.equal(init.count,2);assert.deepEqual(init.options.map(o=>o.bet/baseLines),[80,200]);assert.equal(scales[1]/scales[0],1.5);
 assert.equal(fields.has('mgckey'),false);assert.equal(fields.has('balance'),false);
});

test('manual Helios evidence retains the final free-spin marker and distinct ante request/response lines',async()=>{
 const s=new PragmaticSession({entries:async()=>entries});const captured=(await s.capture('read',0)).exchanges;
 assert.equal(captured.length,38);
 assert.equal(captured[26].response.fs_total,'14');assert.equal(captured[26].response.fs,undefined);assert.equal(captured[26].response.fsmax,undefined);
 const ante=captured.filter(e=>e.request.action==='doSpin'&&e.request.bl==='1');assert.equal(ante.length,9);assert.ok(ante.every(e=>e.request.l==='20'&&e.response.l==='30'));
 const purchases=captured.filter(e=>e.request.pur!==undefined);assert.equal(purchases.length,1);assert.equal(purchases[0].request.pur,'1');
});
test('the real Helios free-spin ending and collect cannot certify an ordinary round',async()=>{
 let list=[entries[0]];const s=new PragmaticSession({entries:async()=>list,provider:{protocolState:async()=>frameState,press:async()=>{list.push(entries[26],entries[27]);return {ok:true};}}});
 assert.equal(await s.verifyBase({expectedBetLevel:0}),false);
});
test('two real Helios ordinary rounds verify after the bonus, including their collect',async()=>{
 let list=[entries[0]],calls=0;const s=new PragmaticSession({entries:async()=>list,provider:{protocolState:async()=>frameState,press:async()=>{calls++;list.push(...(calls===1?[entries[35]]:[entries[36],entries[37]]));return {ok:true};}}});
 assert.equal(await s.verifyBase({expectedBetLevel:0}),true);assert.equal(calls,2);
});
