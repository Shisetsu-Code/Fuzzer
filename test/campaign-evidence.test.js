import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {exportLiveEvidence} from '../scripts/ci/export-live-evidence.mjs';

test('public evidence reports campaign slices but excludes private scheduler state and HAR paths',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'campaign-export-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const artifactDir=path.join(dir,'private'),outputDir=path.join(dir,'public');await fs.mkdir(artifactDir);
 const result={status:'PARTIAL',stopReason:'DEADLINE',nodes:[],edges:[],pending:[],actions:2,
  campaign:{slices:3,elapsedMs:1200000,timeoutMs:1200000,deadline:123456},
  resumeState:{queue:[{action:'PRIVATE_SCHEDULER_SENTINEL'}]},savedHarPaths:['PRIVATE_RAW_HAR_SENTINEL']};
 const exported=await exportLiveEvidence({game:{id:'demo',title:'Demo'},result,artifactDir,outputDir});
 const raw=await fs.readFile(exported.resultPath,'utf8');
 assert.ok(!raw.includes('PRIVATE_SCHEDULER_SENTINEL'));assert.ok(!raw.includes('PRIVATE_RAW_HAR_SENTINEL'));
 assert.equal(exported.summary.campaign.slices,3);assert.equal(exported.summary.campaign.timeoutMs,1200000);
});

test('the live campaign uses the authorized 20-minute cap, not a shorter test override',async()=>{
 const text=await fs.readFile(new URL('../.github/workflows/pragmatic-new5.yml',import.meta.url),'utf8');
 assert.match(text,/FUZZER_TIMEOUT_MS: '1200000'/);
 assert.match(text,/max-parallel: 2/);
});

test('the local execution entrypoint shares the campaign defaults and leaves discovery-only explicit',async()=>{
 const {registerFuzzerTools}=await import('../integrations/hardfire/mcp-tools.js');const schemas=new Map();
 const field=()=>{const chain={};for(const name of ['int','positive','optional','url','uuid'])chain[name]=()=>chain;
  for(const name of ['min','max','default'])chain[name]=value=>{chain[name+'Value']=value;return chain;};return chain;};
 registerFuzzerTools({register:(name,_description,schema)=>schemas.set(name,schema),z:{string:field,number:field,boolean:field,enum:field},text:v=>v,controller:{}});
 const execution=schemas.get('pragmatic_explore_start');
 assert.equal(execution.max_actions.defaultValue,100);assert.equal(execution.max_depth.defaultValue,8);
 assert.equal(execution.timeout_ms.defaultValue,1200000);assert.equal(execution.timeout_ms.maxValue,1200000);
 assert.equal(schemas.get('pragmatic_fuzz_start').execute.defaultValue,false);
});

test('retained slice HARs are not exported twice, while a late unmerged cleanup HAR is preserved',async t=>{
 const {consolidateHars}=await import('../integrations/hardfire/har-consolidation.js');const {gunzipSync}=await import('node:zlib');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'campaign-dedup-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const artifactDir=path.join(dir,'private');await fs.mkdir(artifactDir);
 const files=['first.har','second.har','late.har'].map(name=>path.join(artifactDir,name));
 // Identical payloads are still distinct exchanges in different sessions.
 const har={log:{entries:[{request:{method:'POST',url:'https://demogamesfree.pragmaticplay.net/gs2c/gameService',postData:{text:'action=doSpin&pur=0'}},response:{status:200,content:{text:'na=s&balance=100'}}}]}};
 for(const file of files)await fs.writeFile(file,JSON.stringify(har));
 await consolidateHars(files.slice(0,2),artifactDir,{retainSources:true});
 const out=await exportLiveEvidence({game:{id:'demo',title:'Demo'},result:{nodes:[],edges:[],pending:[]},artifactDir,outputDir:path.join(dir,'public'),evidenceHarPaths:files});
 const published=JSON.parse(gunzipSync(await fs.readFile(out.protocolHarPath)));
 assert.equal(published.log.entries.length,3);
});
