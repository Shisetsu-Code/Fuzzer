import test from 'node:test';
import assert from 'node:assert/strict';
import {observedFingerprint,projectObservedHit} from '../integrations/hardfire/fast-hit.js';

test('fresh button fingerprint stable across sprite ordering',()=>{
 const control={name:'ColliderBuy',handlers:[{event:'B'},{event:'A'}],sprite_names:['spriteB','spriteA']};
 const reordered={...control,sprite_names:['spriteA','spriteB'],handlers:[{event:'A'},{event:'B'}]};
 assert.equal(observedFingerprint(control),observedFingerprint(reordered));
 assert.deepEqual(control.sprite_names,['spriteB','spriteA'],'must not mutate runtime evidence');
 assert.notEqual(observedFingerprint(control),observedFingerprint({...control,name:'Different'}));
});

test('fresh frame-only hit is projected to viewport without screenshot dimensions',()=>{
 const placement={viewport:{width:1280,height:720},
  frame:{x:100,y:80,width:800,height:450}};
 assert.deepEqual(projectObservedHit({x:400,y:225},placement,{width:800,height:450}),{x:500,y:305});
 assert.deepEqual(projectObservedHit({x:0,y:0},placement,{width:800,height:450}),{x:100,y:80});
});

test('rejects stale/off-frame/invalid hit instead of clicking unknown coordinates',()=>{
 const placement={viewport:{width:1280,height:720},
  frame:{x:100,y:80,width:800,height:450}};
 assert.equal(projectObservedHit({x:900,y:100},placement,{width:800,height:450}),null);
 assert.equal(projectObservedHit({x:10,y:20},null,{width:800,height:450}),null);
 assert.equal(projectObservedHit({x:NaN,y:1},placement,{width:800,height:450}),null);
 assert.equal(projectObservedHit({x:10,y:1},placement,{width:0,height:450}),null);
});
