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
