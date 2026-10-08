import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {analyzeFeatures} from '../har/features.js';

const entries=JSON.parse(await fs.readFile(new URL('./fixtures/helios-manual-sanitized.json',import.meta.url),'utf8')).log.entries;
const exchange=(request,response,status=200)=>({request:{url:'https://demo.pragmaticplay.net/gameService',postData:{text:request}},response:{status,content:{text:response}}});
test('Helios has two advertised purchases, one executed option, and antebets kept separate',()=>{
 const r=analyzeFeatures({entries,warnings:[]});assert.equal(r.groups.length,1);const g=r.groups[0];assert.equal(g.provider,'pragmatic');assert.equal(g.game,'vs20olympuspot');assert.equal(g.purchases.presence,'PRESENT');assert.equal(g.purchases.advertised_count,2);assert.equal(g.purchases.accepted_options.length,1);assert.equal(g.purchases.attempts,1);assert.equal(g.modifiers.presence,'PRESENT');assert.equal(g.modifiers.advertised_levels[0].multiplier,1.5);assert.equal(g.modifiers.observed_levels.length,1);assert.ok(g.operations.normal_spin>0);assert.ok(g.operations.continuation>0);
});
test('failed purchase is an attempt and not accepted; absence requires explicit evidence',()=>{
 const r=analyzeFeatures({entries:[exchange('action=doSpin&symbol=g&pur=1','error=failed',500)]});const g=r.groups[0];assert.equal(g.purchases.attempts,1);assert.equal(g.purchases.accepted_options.length,0);assert.equal(g.purchases.presence,'PRESENT');assert.equal(g.purchases.advertised_count,null);assert.equal(g.modifiers.presence,'UNKNOWN');
 for(const text of ['symbol=g&sc=1','symbol=g&purInit=bad'])assert.equal(analyzeFeatures({entries:[exchange('action=doInit&symbol=g',text)]}).groups[0].purchases.presence,'UNKNOWN');
 assert.equal(analyzeFeatures({entries:[exchange('action=doInit&symbol=g','symbol=g&purInit=[]')]}).groups[0].purchases.presence,'ABSENT_EXPLICIT');
});
test('normal spins, bl levels and cascades do not create purchases',()=>{
 const r=analyzeFeatures({entries:[exchange('action=doInit&symbol=g','symbol=g&purInit=[]&bls=20,30'),exchange('action=doSpin&symbol=g&bl=1','na=s&bl=1'),exchange('action=doSpin&symbol=g&bl=0','na=s&rs_c=1'),exchange('action=doCollect&symbol=g','na=s'),exchange('action=doSpin&symbol=g&bl=0','na=s')]});const g=r.groups[0];assert.equal(g.purchases.advertised_count,0);assert.equal(g.purchases.attempts,0);assert.equal(g.operations.normal_spin,1);assert.equal(g.operations.modifier_spin,1);assert.equal(g.operations.continuation,2);
});
test('games and sessions do not share inventory and incomplete capture remains explicit',()=>{
 const r=analyzeFeatures({warnings:['CAPTURE_INCOMPLETE'],entries:[exchange('action=doInit&symbol=g&mgckey=A','symbol=g&purInit=[{bet:10}]'),exchange('action=doInit&symbol=g&mgckey=B','symbol=g&purInit=[]'),exchange('action=doSpin&symbol=h','na=s')]});assert.equal(r.groups.length,3);assert.deepEqual(r.groups.map(g=>g.purchases.advertised_count),[1,0,null]);assert.ok(r.warnings.includes('CAPTURE_INCOMPLETE'));assert.ok(!JSON.stringify(r).includes('mgckey'));
});
test('unknown providers do not confirm purchases from suggestive field names',()=>{
 const e=exchange('buy=1&spin=1','{"buyCount":7}');e.request.url='https://3oaks.invalid/demo/';const r=analyzeFeatures({entries:[e]});assert.equal(r.groups[0].provider,'unknown');assert.equal(r.groups[0].purchases.presence,'UNKNOWN');assert.equal(r.groups[0].purchases.advertised_count,null);assert.ok(r.warnings.includes('NO_SPECIALIZED_ADAPTER'));
});
test('different initialization inventories remain separate observations rather than last-value certainty',()=>{
 const g=analyzeFeatures({entries:[exchange('action=doInit&symbol=g','symbol=g&purInit=[]'),exchange('action=doInit&symbol=g','symbol=g&purInit=[{bet:10}]')]}).groups[0];assert.equal(g.purchases.advertised_count,null);assert.ok(g.warnings.includes('INVENTORY_CHANGED'));assert.equal(g.purchases.inventories.length,2);
});
test('HTTP success carrying a provider error does not confirm a purchase',()=>{
 const g=analyzeFeatures({entries:[exchange('action=doSpin&symbol=g&pur=0','msg_code=ERROR&ext_code=123')]}).groups[0];assert.equal(g.purchases.accepted_options.length,0);
});
