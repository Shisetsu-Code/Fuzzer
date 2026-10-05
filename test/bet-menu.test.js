import test from 'node:test';
import assert from 'node:assert/strict';
import {pragmatic} from '../providers/pragmatic/parser/runtime.js';
test('closes only the enabled bet panel close control and verifies closure',async()=>{
 const old={window:globalThis.window,globalRuntime:globalThis.globalRuntime,XTButton:globalThis.XTButton};
 let open=true,clicks=0;
 const button={gameObject:{name:'Close_Button',get activeInHierarchy(){return open;},parent:{name:'BetSettingsPanel'}},xtEnabled:true,OnClick(){open=false;clicks++;}};
 globalThis.window=globalThis;globalThis.XTButton=class{};globalThis.globalRuntime={sceneRoots:[{GetComponentsInChildren:()=>[button]}]};
 try{const result=await pragmatic.closeBetMenu({evaluate:async fn=>fn()});assert.equal(result.ok,true);assert.equal(clicks,1);assert.equal((await pragmatic.closeBetMenu({evaluate:async fn=>fn()})).closed,false);}
 finally{Object.assign(globalThis,old);}
});
