import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {exportLiveEvidence} from '../scripts/ci/export-live-evidence.mjs';
const game={id:'probe',title:'Probe',url:'https://www.pragmaticplay.fun/en/slots/probe/'};
test('a bounded profiler trace is published alongside the normal evidence and hashed',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'perf-export-'));try{
  const artifactDir=path.join(temp,'private');await fs.mkdir(artifactDir);
  await fs.writeFile(path.join(artifactDir,'performance.json'),JSON.stringify({schema:'fuzzer/performance/v1',stages:[],trace:[],token:'SECRET'}));
  const out=await exportLiveEvidence({game,result:{status:'PARTIAL',nodes:[],edges:[],pending:[],actions:0},artifactDir,outputDir:path.join(temp,'public')});
  assert(out.files.some(f=>f.path==='performance.json'&&f.sha256));assert(!(await fs.readFile(path.join(temp,'public','performance.json'),'utf8')).includes('SECRET'));
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('a profiler symlink outside the owned evidence root is not published',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'perf-link-'));try{
  const artifactDir=path.join(temp,'private');await fs.mkdir(artifactDir);
  await fs.writeFile(path.join(temp,'external.json'),'SECRET');
  try{await fs.symlink(path.join(temp,'external.json'),path.join(artifactDir,'performance.json'));}catch(error){if(process.platform==='win32'&&error.code==='EPERM'){t.skip('Symlink creation unavailable to this Windows account');return;}throw error;}
  const out=await exportLiveEvidence({game,result:{status:'PARTIAL',nodes:[],edges:[],pending:[],actions:0},artifactDir,outputDir:path.join(temp,'public')});
  assert(!out.files.some(f=>f.path==='performance.json'));assert(out.warnings.some(w=>w.code==='PERFORMANCE_UNAVAILABLE'));
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
