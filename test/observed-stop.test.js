import test from 'node:test';import assert from 'node:assert/strict';
import * as controls from '../integrations/hardfire/observed-stop.js';
const stop={path:'GUI/StopSpin_Button',enabled:true,handlers:[{event:'Evt_DataToCode_Pressed_Stop'}],hit_rect:{x:20,y:30,width:40,height:40}};
const state={flags:{stopActive:true},choices:[],wager:{menuOpen:false},capture:{marker:'one',pending:false,uncertain:false},operation:{protocolComplete:true}};
const capture=()=>({marker:'one',pending:false,uncertain:false});
test('a visible Stop is physically clicked once through its current area, never an internal event',async()=>{
 const clicks=[];const r=await controls.pressObservedStop({current:state,readControls:async()=>[stop],readCapture:capture,click:async(x,y)=>{clicks.push([x,y]);return {ok:true};}});
 assert.deepEqual(clicks,[[40,50]]);assert.equal(r.kind,'OBSERVED_STOP');assert.equal(r.clicked,true);
});
for(const [name,opts]of [['disabled',{readControls:async()=>[{...stop,enabled:false}]}],['invalid geometry',{readControls:async()=>[{...stop,hit_rect:{x:NaN,y:0,width:10,height:10}}]}],['pending',{readCapture:()=>({...capture(),pending:true})}],['changed',{readCapture:()=>({...capture(),marker:'two'})}],['ambiguous',{readControls:async()=>[stop,{...stop,path:'duplicate'}]}],['expired',{now:()=>10,deadline:10}]])test('Stop does not click when '+name,async()=>{
 let calls=0;const r=await controls.pressObservedStop({current:state,readControls:async()=>[stop],readCapture:capture,click:async()=>{calls++;},...opts});assert.equal(calls,0);assert.equal(r.clicked,false);
});
test('an uncertain Stop dispatch cannot fall through to a second input',async()=>{
 const r=await controls.pressObservedStop({current:state,readControls:async()=>[stop],readCapture:capture,click:async()=>{throw Error('uncertain');}});
 assert.equal(r.ok,false);assert.equal(r.clicked,true);assert.equal(r.reason,'CONTINUATION_ACTION_UNCONFIRMED');
});
