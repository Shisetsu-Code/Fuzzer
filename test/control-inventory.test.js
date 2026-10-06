import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {inspectControlInventory} from '../scripts/ci/control-inventory.mjs';
test('control diagnostics are bounded metadata and do not expose credentials or invoke click handlers',()=>{
 function XTButton(){};let clicks=0;const go={name:'Accept',activeInHierarchy:true,transform:null,collider:{enabled:true}};go.transform={gameObject:go};
 const button={gameObject:go,secret:'NEVER_EXPORT',token:'NEVER_EXPORT',OnClick(){clicks++;}};
 const out=vm.runInNewContext('('+inspectControlInventory.toString()+')()',{XTButton,globalRuntime:{sceneRoots:[{GetComponentsInChildren:()=>[button]}]}});
 assert.equal(out.candidates.length,1);assert.equal(out.candidates[0].controlPath,'Accept');assert.equal(clicks,0);assert(!JSON.stringify(out).includes('NEVER_EXPORT'));
});
