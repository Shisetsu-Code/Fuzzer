import test from 'node:test';
import assert from 'node:assert/strict';
import {pragmatic} from '../providers/pragmatic/parser/runtime.js';
const frame={evaluate:async(fn,arg)=>fn(arg)};
async function fixture(options,run){
 let clicks=0;const button={gameObject:{name:'Collider',activeInHierarchy:options.active},xtEnabled:options.enabled,eventToCode:{name:'Evt_DataToCode_BonusPickItemClicked'},OnClick(){clicks++;}};
 const globals={XT:{},Vars:{},XTButton:class {},globalRuntime:{sceneRoots:[{GetComponentsInChildren:()=>[button]}]}};
 Object.assign(globalThis,globals);
 try{await run(()=>clicks);}finally{for(const key of Object.keys(globals))delete globalThis[key];}
}
for(const options of [{active:true,enabled:false},{active:undefined,enabled:true}])test(`disabled or unconfirmed picker is not actionable: ${JSON.stringify(options)}`,async()=>{
 await fixture(options,async clicks=>{
  const state=await pragmatic.protocolState(frame);assert.equal(state.pickerControls[0].active,false);
  const result=await pragmatic.pressProtocolChoice(frame,{root:0,index:0,name:'Collider',event:'Evt_DataToCode_BonusPickItemClicked'});assert.equal(result.ok,false);assert.equal(clicks(),0);
 });
});
test('an enabled visible hierarchy picker remains actionable',async()=>{
 await fixture({active:true,enabled:true},async clicks=>{
  const state=await pragmatic.protocolState(frame);assert.equal(state.pickerControls[0].active,true);
  assert.equal((await pragmatic.pressProtocolChoice(frame,{root:0,index:0,name:'Collider',event:'Evt_DataToCode_BonusPickItemClicked'})).ok,true);assert.equal(clicks(),1);
 });
});
