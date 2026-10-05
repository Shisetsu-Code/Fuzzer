import test from 'node:test';
import assert from 'node:assert/strict';
import {pragmatic} from '../providers/pragmatic/parser/runtime.js';
import {PragmaticSession} from '../providers/pragmatic/session.js';
const frame={evaluate:async(fn,arg)=>fn(arg)};
const countingState=()=>({canSpin:true,lastWinIsCounting:true,waitInResultForBigWin:false,stopActive:true,stopControls:[{active:true,name:'StopSpin_Button',event:'Evt_DataToCode_Pressed_Stop'}],pickerControls:[{active:false}],stages:[{name:'StageResult'}]});
test('an advertised Stop finishes bonus entry even after win counting stopped',async()=>{
 const events=[];globalThis.Vars={Evt_DataToCode_Pressed_Stop:'stop'};globalThis.XT={TriggerEvent:event=>events.push(event)};
 const state={...countingState(),lastWinIsCounting:false,mustOpenBonus:true};
 try{const result=await ({...pragmatic,protocolState:async()=>state}).continueProtocol(frame,{na:'b'});assert.equal(result.ok,true);assert.deepEqual(events,['stop']);}
 finally{delete globalThis.Vars;delete globalThis.XT;}
});
test('the available result Stop can continue an intro without counting flags',async()=>{
 const events=[];globalThis.Vars={Evt_DataToCode_Pressed_Stop:'stop'};globalThis.XT={TriggerEvent:event=>events.push(event)};
 const state={...countingState(),lastWinIsCounting:false,mustOpenBonus:false,stages:[{name:'StageResultFreeSpin'}]};
 try{const result=await ({...pragmatic,protocolState:async()=>state}).continueProtocol(frame,{na:'fso'});assert.equal(result.ok,true);assert.deepEqual(events,['stop']);}
 finally{delete globalThis.Vars;delete globalThis.XT;}
});
for(const na of ['b','fso','c'])test(`result counting finishes through its active Stop before interpreting na=${na}`,async()=>{
 const events=[];globalThis.Vars={Evt_DataToCode_Pressed_Stop:'stop'};globalThis.XT={TriggerEvent:event=>events.push(event)};
 const state=countingState();if(na!=='b'){state.stages=[{name:'StageResultFreeSpin',fsStartConfirmed:false}];state.logicIsFreeSpin=true;}
 const provider={...pragmatic,protocolState:async()=>state};
 try{const result=await provider.continueProtocol(frame,{na});assert.equal(result.ok,true);assert.equal(result.waiting,true);assert.equal(result.kind,'result-counting-stop');assert.deepEqual(events,['stop']);}
 finally{delete globalThis.Vars;delete globalThis.XT;}
});
test('free-spin collect wait lets the proven result counting Stop reach the provider',async()=>{
 const events=[];globalThis.Vars={Evt_DataToCode_Pressed_Stop:'stop'};globalThis.XT={TriggerEvent:event=>events.push(event)};
 const state={...countingState(),logicIsFreeSpin:true,stages:[{name:'StageResultFreeSpin'}]};
 const provider={...pragmatic,protocolState:async()=>state};
 const s=new PragmaticSession({frame,entries:async()=>[],provider});s.latestExchange=async()=>({na:'c'});
 try{const result=await s.perform({kind:'continue'});assert.equal(result.kind,'result-counting-stop');assert.equal(result.waiting,true);assert.deepEqual(events,['stop']);}
 finally{delete globalThis.Vars;delete globalThis.XT;}
});
for(const variant of ['hidden','finished','picker'])test(`a ${variant} result does not authorize a counting Stop`,async()=>{
 const events=[];globalThis.Vars={Evt_DataToCode_Pressed_Stop:'stop'};globalThis.XT={TriggerEvent:event=>events.push(event)};
 const state=countingState();if(variant==='hidden')state.stopControls[0].active=false;if(variant==='finished'){state.lastWinIsCounting=false;state.stopControls[0].active=false;}if(variant==='picker')state.pickerControls=[{active:true,name:'Choice'}];
 const provider={...pragmatic,protocolState:async()=>state};
 try{await provider.continueProtocol(frame,{na:'b'});assert.deepEqual(events,[]);}
 finally{delete globalThis.Vars;delete globalThis.XT;}
});
