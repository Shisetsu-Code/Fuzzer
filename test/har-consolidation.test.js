import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {consolidateHars} from '../integrations/hardfire/har-consolidation.js';
test('writes each HAR entry separately and removes sources only after successful output',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'har-merge-'));const files=[path.join(dir,'a.har'),path.join(dir,'b.har')];for(const [i,file]of files.entries())await fs.writeFile(file,JSON.stringify({log:{version:'1.2',creator:{name:'test'},entries:[{request:{url:String(i)}}]}}));const result=await consolidateHars(files,dir);const har=JSON.parse(await fs.readFile(result,'utf8'));assert.deepEqual(har.log.entries.map(e=>e.request.url),['0','1']);for(const f of files)await assert.rejects(fs.access(f));await fs.rm(dir,{recursive:true});});
test('consolidation preserves the warning for a response body that timed out',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'har-incomplete-'));try{const file=path.join(dir,'partial.har');await fs.writeFile(file,JSON.stringify({log:{entries:[],_captureIncomplete:{reason:'PENDING_BODIES_TIMEOUT',pendingBodies:1}}}));const result=await consolidateHars([file],dir);const har=JSON.parse(await fs.readFile(result,'utf8'));assert.equal(har.log._incompleteSources[0].reason,'PENDING_BODIES_TIMEOUT');assert.equal(har.log._incompleteSources[0].source,'partial.har');}finally{await fs.rm(dir,{recursive:true});}});

test('campaign consolidation retains original sources for later slices and recomputes body references',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'har-campaign-'));
 try{
  const files=[path.join(dir,'one.har'),path.join(dir,'two.har')];
  for(const file of files)await fs.writeFile(file,JSON.stringify({log:{entries:[{response:{content:{text:'same-body'}}}]}}));
  await consolidateHars(files.slice(0,1),dir,{retainSources:true});await fs.access(files[0]);
  const final=await consolidateHars(files,dir,{retainSources:true});
  const har=JSON.parse(await fs.readFile(final,'utf8'));
  assert.equal(har.log.entries.length,2);assert.equal(har.log.entries[0].response.content.text,'same-body');
  assert.equal(har.log.entries[1].response.content._bodyReference.entry,0);
  for(const file of files)await fs.access(file);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
