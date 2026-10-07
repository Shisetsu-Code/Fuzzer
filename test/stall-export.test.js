import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {exportLiveEvidence} from '../scripts/ci/export-live-evidence.mjs';

test('the export reserves its first image for the latest blocked screen, not the first branch close',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stall-export-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const artifactDir=path.join(dir,'private');await fs.mkdir(artifactDir);
 const refs=[];for(const [i,role]of ['observed','diagnostic','diagnostic'].entries()){
  const full_path=path.join(artifactDir,i+'.jpg');await fs.writeFile(full_path,Buffer.from([255,216,255,i,255,217]));
  refs.push({full_path,role,reason:'OPERATION_STALLED',capturedAtMs:i*1000,phase:'operation'});
 }
 const out=await exportLiveEvidence({game:{id:'demo'},result:{nodes:[],edges:[],pending:[],branchCaptures:refs},artifactDir,outputDir:path.join(dir,'public'),limits:{maxScreenshots:1}});
 assert.equal((await fs.readFile(path.join(dir,'public',out.screenshots[0].path)))[3],2);
 assert.equal(out.screenshots[0].reason,'OPERATION_STALLED');assert.equal(out.screenshots[0].capturedAtMs,2000);
});

test('a durable stall journal is exported even when the final result lost the screenshot reference',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stall-journal-export-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const artifactDir=path.join(dir,'private');await fs.mkdir(artifactDir);const full_path=path.join(artifactDir,'last.jpg');
 await fs.writeFile(full_path,Buffer.from([255,216,255,0,255,217]));
 await fs.writeFile(path.join(artifactDir,'stall-captures.json'),JSON.stringify({schema:'fuzzer/stall-captures/v1',omitted:0,captures:[{full_path,role:'diagnostic',reason:'OPERATION_TIMEOUT',capturedAtMs:5000}]}));
 const out=await exportLiveEvidence({game:{id:'demo'},result:{nodes:[],edges:[],pending:[]},artifactDir,outputDir:path.join(dir,'public')});
 assert.equal(out.screenshots.length,1);assert.equal(out.screenshots[0].reason,'OPERATION_TIMEOUT');
});
