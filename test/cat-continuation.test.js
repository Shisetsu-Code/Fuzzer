import test from 'node:test';
import assert from 'node:assert/strict';
import {pragmatic} from '../providers/pragmatic/parser/runtime.js';

for(const entering of [true,false])test(`stalled free-spin entry uses its native SpinUtils unblock only when entering (${entering})`,async()=>{
 const keys=['SpinBlockEnabler','globalRuntime','XT','Vars'];const old=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));let calls=0;
 class StageResultFreeSpin {constructor(){this.shouldEnterFS=entering;this.mustSpin=true;}}
 globalThis.SpinBlockEnabler=class{};
 globalThis.Vars={CanSpin:'ready',Logic_IsFreeSpin:'fs',SpinBlockingFeatureIsRunning:'block',ReceivedFreeSpinsResponse:'response',Evt_DataToCode_Pressed_Stop:'stop'};
 globalThis.XT={GetBool:key=>['ready','fs','block'].includes(key),GetObject:()=>({CurrentSpin:1,MaxSpins:13,IsLastFreeSpin:false}),variablesEvent:{stop:[{OnValueChanged:[{object:new StageResultFreeSpin()}]}]}};
 globalThis.globalRuntime={sceneRoots:[{GetComponentsInChildren:()=>[{gameObject:{name:'SpinUtils',activeInHierarchy:true},UnblockSpin:()=>{calls++;}}]}]};
 try{const result=await pragmatic.recoverFeatureStart({evaluate:async(fn,arg)=>fn(arg)});assert.equal(result.ok,entering);assert.equal(calls,entering?1:0);}
 finally{for(const [key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

test('a picker runs its sibling CAT release animation as well as its single server click',async()=>{
 const keys=['CATButton','XTButton','globalRuntime'];const previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));const calls=[];
 globalThis.CATButton=class{};globalThis.XTButton=class{};
 const cat={catEventRelease:{cat:{},id:2},catEventClick:{cat:{},id:1},OnPress:value=>calls.push(['release',value]),OnClick:()=>calls.push(['animation'])};
 const button={gameObject:{name:'Collider',activeInHierarchy:true,GetComponent:type=>type===CATButton?cat:null},eventToCode:{name:'Pick'},OnClick:()=>calls.push(['server'])};
 globalThis.globalRuntime={sceneRoots:[{GetComponentsInChildren:()=>[button]}]};
 try{const result=await pragmatic.pressProtocolChoice({evaluate:async(fn,arg)=>fn(arg)},{root:0,index:0,name:'Collider',event:'Pick'});assert.equal(result.ok,true);assert.deepEqual(calls,[['release',true],['release',false],['animation'],['server']]);assert.equal(result.companion.kind,'CATButton');}
 finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

for(const active of [true,false])test(`blocked free spins use the configured CAT release continuation (${active})`,async()=>{
 const previous={CATButton:globalThis.CATButton,globalRuntime:globalThis.globalRuntime};const calls=[];
 globalThis.CATButton=class{};
 const button={gameObject:{name:'ButtonContinue',activeInHierarchy:active},catEventRelease:{cat:{IsEventRunning:()=>false},id:2},OnPress:value=>calls.push(value),OnClick:()=>assert.fail('release-only button must not use OnClick')};
 globalThis.globalRuntime={sceneRoots:[{GetComponentsInChildren:()=>[button]}]};
 try{
  const provider={...pragmatic,protocolState:async()=>({canSpin:true,logicIsFreeSpin:true,spinBlockingFeatureIsRunning:true,stages:[{name:'StageResultFreeSpin',mustSpin:true}],pickerControls:[]})};
  const result=await provider.continueProtocol({evaluate:async(fn,arg)=>fn(arg)},{na:'s',fs:'1',fsmax:'15'});
  assert.deepEqual(calls,active?[true,false]:[]);assert.equal(result.kind,active?'feature-cat-continue':'feature-wait');
 }finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
