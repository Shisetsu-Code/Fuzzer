import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function setup(t){
 const mod=await import('../scripts/ci/latest-gallery.mjs').catch(()=>null);assert.ok(mod,'latest-gallery implementation is required');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'gallery-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 return {mod,root};
}
async function artifact(root,id='dragon',image='01.jpg'){
 const dir=path.join(root,id);await fs.mkdir(path.join(dir,'screenshots'),{recursive:true});
 const bytes=Buffer.from([255,216,255,224,1,255,217]);await fs.writeFile(path.join(dir,'screenshots',image),bytes);
 const summary=Buffer.from(JSON.stringify({game:{id,title:'Dragon <script>'},resultStatus:'PARTIAL',stopReason:'DEADLINE',actions:3,cleanupPending:false,execution:{sourceCommit:'a'.repeat(40)}}));
 await fs.writeFile(path.join(dir,'summary.json'),summary);
 const manifest={schema:'fuzzer/live-evidence/v1',gameId:id,files:[{path:'summary.json',bytes:summary.length,sha256:hash(summary)},{path:'screenshots/'+image,bytes:bytes.length,sha256:hash(bytes)}],screenshots:[{path:'screenshots/'+image,reason:'OPERATION_STALLED',phase:'operation',capturedAtMs:1000}]};
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));return dir;
}

test('gallery copies only verified JPEGs and renders failure context without executable markup',async t=>{
 const h=await setup(t);const inputDir=path.join(h.root,'inputs');await artifact(inputDir);
 const outputDir=path.join(h.root,'output');const r=await h.mod.buildLatestGallery({inputDir,outputDir,runId:'20',attempt:1,sourceCommit:'a'.repeat(40)});
 assert.equal(r.games[0].imageCount,1);const readme=await fs.readFile(path.join(outputDir,'README.md'),'utf8');
 assert.match(readme,/OPERATION_STALLED/);assert.ok(!readme.includes('<script>'));await fs.access(path.join(outputDir,'dragon','01.jpg'));
 await assert.rejects(h.mod.buildLatestGallery({inputDir,outputDir,runId:'21',attempt:1,sourceCommit:'a'.repeat(40)}),/NOT_EMPTY/);
});

test('unsafe screenshot paths and changed image hashes are rejected',async t=>{
 const h=await setup(t);const inputDir=path.join(h.root,'inputs'),dir=await artifact(inputDir);
 const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
 manifest.screenshots[0].path='../private.jpg';await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));
 await assert.rejects(h.mod.buildLatestGallery({inputDir,outputDir:path.join(h.root,'bad-path'),runId:'20',sourceCommit:'a'.repeat(40)}),/UNSAFE/);
 manifest.screenshots[0].path='screenshots/01.jpg';await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));
 await fs.writeFile(path.join(dir,'screenshots/01.jpg'),Buffer.from([255,216,255,2]));
 await assert.rejects(h.mod.buildLatestGallery({inputDir,outputDir:path.join(h.root,'bad-hash'),runId:'20',sourceCommit:'a'.repeat(40)}),/INTEGRITY/);
});

test('an artifact from another source commit cannot masquerade as this run',async t=>{
 const h=await setup(t);const inputDir=path.join(h.root,'inputs');await artifact(inputDir);
 await assert.rejects(h.mod.buildLatestGallery({inputDir,outputDir:path.join(h.root,'output'),runId:'20',sourceCommit:'b'.repeat(40)}),/SOURCE_MISMATCH/);
});

test('publishing replaces only the dedicated gallery branch, with one commit and no old screenshots',async t=>{
 const h=await setup(t),remote=path.join(h.root,'remote.git');execFileSync('git',['init','--bare',remote],{stdio:'ignore'});
 const publish=async(id,image)=>{
  const inputDir=path.join(h.root,'input-'+id);await artifact(inputDir,'dragon',image);
  const directory=path.join(h.root,'out-'+id);await h.mod.buildLatestGallery({inputDir,outputDir:directory,runId:String(id),sourceCommit:'a'.repeat(40)});
  return h.mod.publishLatestGallery({directory,remote});
 };
 assert.equal((await publish(20,'01.jpg')).status,'PUBLISHED');assert.equal((await publish(21,'02.jpg')).status,'PUBLISHED');
 assert.equal(execFileSync('git',['--git-dir',remote,'rev-list','--count','fuzzer-latest-run'],{encoding:'utf8'}).trim(),'1');
 const files=execFileSync('git',['--git-dir',remote,'ls-tree','-r','--name-only','fuzzer-latest-run'],{encoding:'utf8'});
 assert.ok(files.includes('dragon/02.jpg'));assert.ok(!files.includes('dragon/01.jpg'));
 assert.equal((await publish(19,'03.jpg')).status,'STALE');
 const refs=execFileSync('git',['--git-dir',remote,'for-each-ref','--format=%(refname)'],{encoding:'utf8'}).trim();assert.equal(refs,'refs/heads/fuzzer-latest-run');
});
