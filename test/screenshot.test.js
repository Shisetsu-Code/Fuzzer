import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHardFireSession,refreshOwnedSurface} from '../integrations/hardfire/session.js';
import {runPragmatic} from '../providers/pragmatic/flow.js';
const gameUrl='https://www.pragmaticplay.fun/en/slots/coven-rising/';
for(const visible of [true,false])test(`surface recovery preserves browser visibility (${visible}) and targets its own tab`,async()=>{
 const events=[];
 await refreshOwnedSurface({tabs:{activate:id=>events.push(['tab',id])}},
  {_wc:()=>({invalidate:()=>events.push(['paint'])}),status:async()=>({visible}),browser:async mode=>events.push(['mode',mode])},88);
 assert.deepEqual(events,[['tab',88],['paint'],['mode',visible?'visible':'hidden']]);
});

test('an empty background capture activates only its owned tab and retries before cleanup',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-retry-shot-'));
 const failure=new Error('launcher failed');let captures=0;const events=[];
 const scoped={recordStart:async()=>{throw failure;},screenshot:async()=>{captures++;if(captures===1)throw new Error('screenshot_empty: browser produced no pixels');return Buffer.from('jpeg');}};
 const controller={tabs:{new:async()=>({id:71}),resolve:()=>({sessionIsolated:true}),activate:id=>events.push(id),close:async()=>{}},withTab:()=>scoped};
 try {await assert.rejects(createHardFireSession(controller,{gameUrl,artifactDir:dir}),e=>e===failure);assert.equal(captures,2);assert.deepEqual(events,[71]);assert.equal(await fs.readFile(failure.screenshot.path,'utf8'),'jpeg');}
 finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('startup failure saves the owned tab JPEG before HAR and close',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-shot-'));const events=[];
 const failure=new Error('launcher failed');
 const scoped={recordStart:async()=>{},open:async()=>{throw failure;},screenshot:async quality=>{events.push(['capture',quality]);return Buffer.from('jpeg');},recordSave:async()=>assert.fail('shared timestamp HAR saver must not be used')};
 const controller={tabs:{new:async()=>({id:42}),resolve:id=>{assert.equal(id,42);return {sessionIsolated:true,recorder:{recording:true,stop:async()=>{events.push(['har']);return {log:{entries:[{request:{url:gameUrl}}]}};}}};},close:async id=>events.push(['close',id])},withTab:id=>{assert.equal(id,42);return scoped;},screenshot:()=>assert.fail('source tab must not be captured')};
 try{
  await assert.rejects(createHardFireSession(controller,{gameUrl,artifactDir:dir}),error=>{assert.equal(error,failure);assert.equal(error.screenshot.tabId,42);assert.equal(error.screenshot.reason,'SESSION_STARTUP_FAILED');return true;});
  assert.deepEqual(events,[['capture',65],['har'],['close',42]]);
  assert.equal(await fs.readFile(failure.screenshot.path,'utf8'),'jpeg');
  assert.equal(failure.har.entries,1);assert.deepEqual(JSON.parse(await fs.readFile(failure.har.path,'utf8')).log.entries,[{request:{url:gameUrl}}]);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('screenshot failure preserves startup exception and cleanup',async()=>{
 const failure=new Error('real failure');let closed=false;
 const scoped={recordStart:async()=>{throw failure;},screenshot:async()=>{throw new Error('closed viewport');}};
 const controller={tabs:{new:async()=>({id:43}),resolve:()=>({sessionIsolated:true}),close:async()=>{closed=true;}},withTab:()=>scoped};
 await assert.rejects(createHardFireSession(controller,{gameUrl}),error=>{assert.equal(error,failure);assert.match(error.screenshot.error,/closed viewport/);assert.equal(error.screenshot.path,undefined);return true;});assert.equal(closed,true);
});
const buy={id:'buy:0',kind:'buy'},entry={inventoryKnown:true,terminal:true,options:[buy]};
test('startup HAR failure retains the original failure and leaves owned tab available',async()=>{
 const failure=new Error('prepare failed');let closed=false;
 const scoped={recordStart:async()=>{throw failure;},screenshot:async()=>{throw new Error('no pixels');},recordSave:async()=>assert.fail('shared HAR saver must not be used')};
 const controller={tabs:{new:async()=>({id:45}),resolve:()=>({sessionIsolated:true,recorder:{recording:true,stop:async()=>{throw new Error('HAR disk failure');}}}),close:async()=>{closed=true;}},withTab:()=>scoped};
 await assert.rejects(createHardFireSession(controller,{gameUrl}),error=>{assert.equal(error,failure);assert.match(error.cleanupError,/HAR disk failure/);return true;});assert.equal(closed,false);
});
for(const [scenario,reason] of [['action','ACTION_FAILED'],['transition','TRANSITION_TIMEOUT'],['step','STEP_LIMIT'],['execution','EXECUTION_ERROR']])test(`pending ${scenario} captures branch before closing`,async()=>{
 const events=[];const shot={path:'/local/failure.jpg',tabId:44,mimeType:'image/jpeg'};
 const child={observe:async()=>entry,capture:async()=>({}),perform:async()=>{if(scenario==='execution')throw new Error('execution broke');return {ok:scenario!=='action'};},waitForTransition:async()=>scenario!=='transition',captureFailure:async context=>{events.push(['capture',context]);return shot;},close:async()=>events.push(['close'])};
 const result=await runPragmatic({observe:async()=>entry,forkDemo:async()=>child},{maxSteps:1,maxBranches:1});
 assert.equal(result.tree[0].reason,reason);assert.equal(result.tree[0].screenshot,shot);assert.deepEqual(events,[['capture',{reason,branch:['buy:0']}],['close']]);
});
test('failed branch capture preserves the action reason and HAR cleanup',async()=>{
 const child={observe:async()=>entry,capture:async()=>({}),perform:async()=>({ok:false}),captureFailure:async()=>{throw new Error('viewport gone');},close:async()=>{child.har='evidence.har';}};
 const result=await runPragmatic({observe:async()=>entry,forkDemo:async()=>child});
 assert.equal(result.tree[0].reason,'ACTION_FAILED');assert.equal(result.tree[0].har,'evidence.har');assert.match(result.tree[0].screenshot.error,/viewport gone/);
});
test('a failed fork keeps its startup screenshot labeled with the attempted branch',async()=>{
 const failure=new Error('fork failed');failure.screenshot={tabId:46,reason:'SESSION_STARTUP_FAILED',branch:[],path:'/local/startup.jpg',mimeType:'image/jpeg'};
 const result=await runPragmatic({observe:async()=>entry,forkDemo:async()=>{throw failure;}});
 assert.deepEqual(result.tree[0].screenshot.branch,['buy:0']);assert.equal(result.tree[0].screenshot.reason,'SESSION_STARTUP_FAILED');
});
test('no screenshot is fabricated when a failed fork never obtained a tab',async()=>{
 const result=await runPragmatic({observe:async()=>entry,forkDemo:async()=>{throw new Error('tab creation failed');}});
 assert.equal(result.tree[0].reason,'EXECUTION_ERROR');assert.equal(result.tree[0].screenshot,undefined);
});
