import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCaptures} from '../har/compare.js';
const capture=(action,bet,token)=>({entries:[{startedDateTime:token,request:{url:'https://example.invalid/demo?token='+token,postData:{text:`action=${action}&bet=${bet}&session=${token}&index=${token}`}},response:{status:200,content:{text:'{"ok":true}'}}}]});
test('comparison ignores secrets and temporal fields and cites observed action and bet differences',()=>{
 const r=compareCaptures(capture('spin','1','SECRETLEFT'),capture('buy','2','SECRETRIGHT'));assert.ok(r.actions.left_only.includes('spin'));assert.ok(r.actions.right_only.includes('buy'));assert.ok(r.values.some(v=>v.field==='request.bet'));assert.ok(r.examples.every(e=>Number.isInteger(e.entry_index)));assert.ok(!JSON.stringify(r).includes('SECRET'));assert.ok(!r.values.some(v=>v.field.endsWith('.index')));
});
test('identical observations with different credentials produce no field value differences',()=>{
 const r=compareCaptures(capture('spin','1','SECRETLEFT'),capture('spin','1','SECRETRIGHT'));assert.equal(r.values.length,0);assert.equal(r.fields.left_only.length,0);
});
