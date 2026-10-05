import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHardFireSession} from '../integrations/hardfire/session.js';
import {saveOwnedHar} from '../integrations/hardfire/har.js';
const gameUrl='https://www.pragmaticplay.fun/en/slots/coven-rising/';

test('an unfinished response cannot block saving owned HAR evidence forever',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-har-pending-'));
 const recorder={recording:false,pendingBodies:new Set([{}]),stop:()=>new Promise(()=>{}),toJSON:()=>({log:{entries:[{request:{url:gameUrl},response:{status:200,content:{_bodyCaptureStatus:'pending'}}}]}})};
 try{
   const result=await Promise.race([saveOwnedHar(recorder,{artifactDir:dir,tabId:1,gameUrl,timeoutMs:20}),new Promise(r=>setTimeout(()=>r('blocked'),150))]);
   assert.notEqual(result,'blocked');assert.equal(result.complete,false);
   const har=JSON.parse(await fs.readFile(result.path,'utf8'));assert.equal(har.log.entries.length,1);assert.equal(har.log._captureIncomplete.reason,'PENDING_BODIES_TIMEOUT');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('five concurrent same-host failures preserve distinct flushed HARs without overwriting existing evidence',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-hars-'));
 const harDir=path.join(dir,'HARs');await fs.mkdir(harDir);
 const sentinel=path.join(harDir,'existing.har');await fs.writeFile(sentinel,'existing evidence');
 const releases=[],failures=[],closed=[];
 const runs=Array.from({length:5},(_,index)=>{
  const id=index+101,error=new Error(`launcher ${id} failed`);failures.push(error);
  const har={log:{entries:[]}};
  const recorder={recording:true,stop:async()=>{
   await new Promise(resolve=>{releases.push(()=>{har.log.entries.push({request:{url:gameUrl},response:{status:200},fixture:id});recorder.recording=false;resolve();});});return har;
  }};
  const scoped={recordStart:async()=>{},open:async()=>{throw error;},screenshot:async()=>{throw new Error('fixture has no viewport');},recordSave:async()=>assert.fail('must bypass collision-prone saver')};
  const controller={tabs:{new:async()=>({id}),resolve:()=>({sessionIsolated:true,recorder}),close:async()=>{assert.equal(recorder.recording,false);closed.push(id);}},withTab:()=>scoped};
  return createHardFireSession(controller,{gameUrl,artifactDir:dir}).catch(observed=>{assert.equal(observed,error);});
 });
 try{
  for(let n=0;n<100&&releases.length<5;n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(releases.length,5);assert.deepEqual(await fs.readdir(harDir),['existing.har']);assert.equal(closed.length,0);
  for(const release of releases)release();await Promise.all(runs);
  assert.equal(new Set(failures.map(error=>error.har.path)).size,5);
  for(let index=0;index<5;index++){
   assert.equal(failures[index].har.entries,1);
   assert.equal(JSON.parse(await fs.readFile(failures[index].har.path,'utf8')).log.entries[0].fixture,index+101);
  }
  assert.equal(await fs.readFile(sentinel,'utf8'),'existing evidence');assert.equal(closed.length,5);
 }finally{for(const release of releases)release();await Promise.all(runs);await fs.rm(dir,{recursive:true,force:true});}
});

test('HAR write failure keeps the owned tab and existing file available',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-har-error-'));await fs.writeFile(path.join(dir,'HARs'),'existing evidence');
 let closed=false;const failure=new Error('startup failed');
 const controller={tabs:{new:async()=>({id:201}),resolve:()=>({sessionIsolated:true,recorder:{recording:true,stop:async()=>({log:{entries:[]}})}}),close:async()=>{closed=true;}},
  withTab:()=>({recordStart:async()=>{throw failure;},screenshot:async()=>{throw new Error('no pixels');},recordSave:async()=>({ok:true})})};
 try{
  await assert.rejects(createHardFireSession(controller,{gameUrl,artifactDir:dir}),error=>{assert.equal(error,failure);assert.ok(error.cleanupError);return true;});
  assert.equal(closed,false);assert.equal(await fs.readFile(path.join(dir,'HARs'),'utf8'),'existing evidence');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('startup HAR failure retains ownership until a successful owned tab closure',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-owned-har-error-'));await fs.writeFile(path.join(dir,'HARs'),'existing evidence');
 const owned=new Set();let closed=false;
 const controller={tabs:{new:async()=>({id:211}),resolve:()=>({sessionIsolated:true,recorder:{recording:true,stop:async()=>({log:{entries:[]}})}}),close:async()=>{closed=true;}},
  withTab:()=>({recordStart:async()=>{throw new Error('startup failed');},screenshot:async()=>{throw new Error('no pixels');}})};
 try{
  await assert.rejects(createHardFireSession(controller,{gameUrl,artifactDir:dir,onOwnedTab:id=>owned.add(id),onClosedTab:id=>owned.delete(id)}),error=>{
   assert.deepEqual(error.retainedTabIds,[211]);assert.ok(error.cleanupError);return true;
  });
  assert.deepEqual([...owned],[211]);assert.equal(closed,false);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('successful startup cleanup releases only its owned tab after HAR saving',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-owned-har-success-'));const events=[];
 const controller={tabs:{new:async()=>({id:212}),resolve:()=>({sessionIsolated:true,recorder:{recording:true,stop:async()=>{events.push('save');return {log:{entries:[]}};}}}),close:async id=>events.push(['close',id])},
  withTab:()=>({recordStart:async()=>{throw new Error('startup failed');},screenshot:async()=>{throw new Error('no pixels');}})};
 try{
  await assert.rejects(createHardFireSession(controller,{gameUrl,artifactDir:dir,onOwnedTab:id=>events.push(['owned',id]),onClosedTab:id=>events.push(['released',id])}),/startup failed/);
  assert.deepEqual(events,[['owned',212],'save',['close',212],['released',212]]);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('retained startup cleanup saves the stopped recorder snapshot before closing and is idempotent',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-har-retry-'));await fs.writeFile(path.join(dir,'HARs'),'blocked');
 let cleanup,stops=0,closes=0;const owned=new Set();
 const recorder={recording:true,stop:async()=>{stops++;recorder.recording=false;return {log:{entries:[{fixture:'retained-response'}]}};}};
 const controller={tabs:{new:async()=>({id:221}),resolve:()=>({sessionIsolated:true,recorder}),close:async()=>{closes++;}},
  withTab:()=>({recordStart:async()=>{throw new Error('startup failed');},screenshot:async()=>{throw new Error('no pixels');}})};
 try{
  await assert.rejects(createHardFireSession(controller,{gameUrl,artifactDir:dir,onOwnedTab:(id,retry)=>{owned.add(id);cleanup=retry;},onClosedTab:id=>owned.delete(id)}),/startup failed/);
  assert.equal(typeof cleanup,'function');assert.equal(closes,0);assert.equal(stops,1);
  await assert.rejects(cleanup());assert.deepEqual([...owned],[221]);assert.equal(closes,0);
  await fs.unlink(path.join(dir,'HARs'));const [har,sameHar]=await Promise.all([cleanup(),cleanup()]);
  assert.equal(sameHar.path,har.path);
  assert.equal(JSON.parse(await fs.readFile(har.path,'utf8')).log.entries[0].fixture,'retained-response');
  assert.equal(stops,1);assert.equal(closes,1);assert.deepEqual([...owned],[]);
  await cleanup();assert.equal(stops,1);assert.equal(closes,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('a recorder stop failure cannot authorize closing unsaved evidence after recording becomes false',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-stop-retry-'));let cleanup,stops=0,closes=0,stopSucceeds=false;
 const recorder={recording:true,stop:async()=>{stops++;recorder.recording=false;if(!stopSucceeds)throw new Error('response capture failed');return {log:{entries:[{fixture:'recoverable'}]}};}};
 const controller={tabs:{new:async()=>({id:222}),resolve:()=>({sessionIsolated:true,recorder}),close:async()=>{closes++;}},
  withTab:()=>({recordStart:async()=>{throw new Error('startup failed');},screenshot:async()=>{throw new Error('no pixels');}})};
 try{
  await assert.rejects(createHardFireSession(controller,{gameUrl,artifactDir:dir,onOwnedTab:(id,retry)=>{cleanup=retry;}}),/startup failed/);
  await assert.rejects(cleanup(),/response capture failed/);assert.equal(closes,0);assert.equal(stops,2);
  stopSucceeds=true;const har=await cleanup();assert.equal(closes,1);assert.equal(stops,3);
  assert.equal(JSON.parse(await fs.readFile(har.path,'utf8')).log.entries[0].fixture,'recoverable');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
