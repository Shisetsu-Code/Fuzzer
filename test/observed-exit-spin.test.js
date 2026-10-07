import test from 'node:test';
import assert from 'node:assert/strict';
// The adapter boundary itself is exercised: runtime flags may lie; physical
// controls, fresh capture and the post-click exchange remain authoritative.
const module=await import('../integrations/hardfire/observed-exit-spin.js').catch(()=>({}));
const spin={path:'root/spin',name:'StartSpin_Button',enabled:true,handlers:[{event:'Evt_DataToCode_Pressed_Spin'}],hit_rect:{x:80,y:40,width:10,height:10}};
const buy={path:'root/buy',name:'BuyButton',enabled:true,handlers:[{event:'buy'}],hit_rect:{x:0,y:0,width:10,height:10}};
const base=[spin,buy];
const exchange={request:{url:'https://demo.invalid/gameService',postData:{text:'action=doSpin&pur=0'}},response:{status:200,content:{text:'na=s&rs_c=1'}}};
function fixture(extra=[]){
 assert.equal(typeof module.assessExitSurface,'function');assert.equal(typeof module.pressExitSpin,'function');
 const capture={entries:[exchange],marker:'old',pending:false,uncertain:false};
 const raw={controls:[...base,...extra],unresolved:[]},surface=module.assessExitSurface(raw,base);
 const clicks=[];
 const input={current:{operation:{sequence:1,protocolSequence:1},capture:{marker:'old'},exitSurface:surface,flags:{canSpin:false,logicIsFreeSpin:true}},baseControls:base,
  readControls:async()=>raw,readCapture:()=>capture,click:async(x,y)=>{clicks.push({x,y});return {ok:true};},now:()=>5000,deadline:10000};
 return {clicks,input,raw,capture,surface};
}

test('the observed base spin is attempted despite stale flags and cascade metadata',async()=>{
 const f=fixture();const result=await module.pressExitSpin(f.input);
 assert.equal(result.ok,true);assert.equal(result.empirical,true);assert.equal(result.sequenceBefore,1);
 assert.equal(f.clicks.length,1);
});

test('a large new overlay covering the spin forbids the probe even though smaller-rect hit tests pass',async()=>{
 const f=fixture([{path:'new/overlay',name:'UnlabelledOverlay',handlers:[{event:'anything'}],hit_rect:{x:0,y:0,width:100,height:100}}]);
 const result=await module.pressExitSpin(f.input);assert.equal(result.clicked,false);assert.equal(f.clicks.length,0);assert.equal(f.surface.clear,false);
});

for(const reason of ['pending','uncertain','changed'])test(`a ${reason} capture during fresh geometry prevents the probe`,async()=>{
 const f=fixture();f.input.readControls=async()=>{if(reason==='changed')f.capture.marker='changed';else f.capture[reason]=true;return f.raw;};
 const result=await module.pressExitSpin(f.input);assert.equal(result.clicked,false);assert.equal(f.clicks.length,0);
});

test('a visible Stop is not treated as a normal spin because a stale spin drawing also exists',async()=>{
 const f=fixture([{...spin,path:'root/stop',name:'StopSpin_Button',handlers:[{event:'Evt_DataToCode_Pressed_Stop'}]}]);
 const result=await module.pressExitSpin(f.input);assert.equal(result.clicked,false);assert.equal(f.clicks.length,0);
});

test('unknown unresolved controls require inspection instead of assuming an empty overlay',async()=>{
 const f=fixture();f.raw.unresolved=[{path:'unknown/prompt',name:'Unknown',reason:'NO_PROJECTED_HIT_RECT'}];
 const result=await module.pressExitSpin(f.input);assert.equal(result.clicked,false);assert.equal(f.clicks.length,0);
});

test('an awaited geometry scan cannot send an input after the operation deadline',async()=>{
 const f=fixture();let t=5000;f.input.now=()=>t;f.input.readControls=async()=>{t=10000;return f.raw;};
 const result=await module.pressExitSpin(f.input);assert.equal(result.clicked,false);assert.equal(f.clicks.length,0);
});

test('a click transport failure is uncertain, never a retryable no-click outcome',async()=>{
 const f=fixture();f.input.click=async()=>{throw Error('lost acknowledgement');};
 const result=await module.pressExitSpin(f.input);assert.equal(result.ok,false);assert.equal(result.clicked,true);assert.equal(result.retryable,false);
});

test('mapped iframe geometry is compared in runtime coordinates but clicked in page coordinates',async()=>{
 const f=fixture();f.input.readControls=async()=>({...f.raw,controls:f.raw.controls.map(c=>({...c,runtime_hit_rect:c.hit_rect,hit_rect:{...c.hit_rect,y:c.hit_rect.y+120}}))});
 const result=await module.pressExitSpin(f.input);
 assert.equal(result.ok,true);assert.deepEqual(f.clicks,[{x:85,y:165}]);
});

test('moving the learned spin area during preflight invalidates the quiet surface',async()=>{
 const f=fixture();f.input.readControls=async()=>({...f.raw,controls:f.raw.controls.map(c=>c.path===spin.path?{...c,hit_rect:{...c.hit_rect,x:90}}:c)});
 const result=await module.pressExitSpin(f.input);assert.equal(result.clicked,false);assert.equal(result.reason,'EXIT_PROBE_SURFACE_CHANGED');
});
