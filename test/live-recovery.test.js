import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
const game={id:'demo',title:'Demo',url:'https://www.pragmaticplay.fun/en/slots/demo/'};
async function fixture(run){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-recovery-'));const artifactDir=path.join(root,'private'),outputDir=path.join(root,'public');await fs.mkdir(artifactDir);try{await run({root,artifactDir,outputDir});}finally{await fs.rm(root,{recursive:true,force:true});}}

test('a separate Node process recovers durable purchase evidence and saved HAR after abrupt Electron loss',()=>fixture(async({artifactDir,outputDir})=>{
 const {recoverLiveEvidence}=await import('../scripts/ci/recover-live-evidence.mjs');
 const harPath=path.join(artifactDir,'own.har');await fs.writeFile(harPath,JSON.stringify({log:{entries:[{request:{url:'https://demo.test/gameService?token=private',method:'POST',postData:{text:'action=doSpin&pur=0&sessionKey=private'}},response:{status:200,content:{text:'na=s&token=private'}}}],_captureIncomplete:{reason:'CI_FINAL_CLEANUP'}}}));
 const entry=new URL('../scripts/ci/recover-live-evidence.mjs',import.meta.url);
 const state={artifactDir,outputDir,game,observedResult:{actions:1,nodes:[{key:'root'}],edges:[{operation:{kind:'purchase',normalSpinVerified:true,submission:{payload:{pur:'0'}}}}],pending:[]},error:{code:'CI_FINAL_BUDGET_EXCEEDED'},execution:{live:true},evidenceHarPaths:[harPath],lastOwnedTabIds:[7],cleanupConfirmed:false};
 const crashed=spawnSync(process.execPath,['--input-type=module','-e',`import {writeRecoveryCheckpoint} from ${JSON.stringify(entry.href)};writeRecoveryCheckpoint(JSON.parse(process.argv[1]));process.kill(process.pid,'SIGKILL');`,JSON.stringify(state)],{encoding:'utf8'});
 assert.equal(crashed.signal,'SIGKILL');assert.equal(crashed.status,null);
 const child=spawnSync(process.execPath,[entry.pathname],{env:{...process.env,FUZZER_ARTIFACT_DIR:artifactDir,FUZZER_OUTPUT_DIR:outputDir,FUZZER_GAME_ID:game.id},encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/FUZZER_SUMMARY_JSON=/);assert.doesNotMatch(child.stdout,/private|sessionKey/);
 const result=JSON.parse(await fs.readFile(path.join(outputDir,'result.json'),'utf8'));
 assert.equal(result.status,'PARTIAL');assert.equal(result.actions,1);assert.equal(result.completeGame,false);assert.equal(result.edges.length,1);assert.equal(result.edges[0].operation.normalSpinVerified,true);assert.equal(result.cleanupPending,true);assert.deepEqual(result.retainedTabIds,[7]);
 const har=JSON.parse(gunzipSync(await fs.readFile(path.join(outputDir,'protocol.har.gz'))));assert.equal(har.log.entries.length,1);assert.equal(har.log._incompleteSources[0].reason,'CI_FINAL_CLEANUP');
 const before=await fs.readFile(path.join(outputDir,'manifest.json'));assert.equal((await recoverLiveEvidence({artifactDir,outputDir,gameId:game.id})).recovered,false);assert.deepEqual(await fs.readFile(path.join(outputDir,'manifest.json')),before);
}));

test('startup loss with no progress exports zero observed actions and safe error labels',()=>fixture(async({artifactDir,outputDir})=>{
 const {writeRecoveryCheckpoint,recoverLiveEvidence}=await import('../scripts/ci/recover-live-evidence.mjs');
 // The runner may already have built its ERROR fallback when native/process
 // failure interrupts the final export. That fallback is not explorer progress.
 writeRecoveryCheckpoint({artifactDir,outputDir,game,observedResult:{status:'ERROR',actions:0,nodes:[],edges:[],pending:[]},progressObserved:false,error:{code:'token="secret"'},lastOwnedTabIds:[],cleanupConfirmed:false});
 const exported=await recoverLiveEvidence({artifactDir,outputDir,gameId:game.id});
 assert.equal(exported.summary.resultStatus,'ERROR');assert.equal(exported.summary.actions,0);assert.equal(exported.summary.error.message,'CI_ELECTRON_INTERRUPTED');
 const result=JSON.parse(await fs.readFile(path.join(outputDir,'result.json'),'utf8'));assert.deepEqual(result.edges,[]);assert.deepEqual(result.nodes,[]);assert.equal(result.cleanupPending,false);assert.equal(result.pending[0].reason,'NO_OBSERVED_PROGRESS');
 assert.doesNotMatch(JSON.stringify(exported.summary),/secret/);
}));

test('recovery moves only its explicitly owned incomplete output and refuses path and size escapes',()=>fixture(async({root,artifactDir,outputDir})=>{
 const {writeRecoveryCheckpoint,recoverLiveEvidence}=await import('../scripts/ci/recover-live-evidence.mjs');
 writeRecoveryCheckpoint({artifactDir,outputDir,game,lastOwnedTabIds:[],exportStarted:false});await fs.mkdir(outputDir);await fs.writeFile(path.join(outputDir,'foreign.txt'),'keep');
 await assert.rejects(recoverLiveEvidence({artifactDir,outputDir,gameId:game.id}),/CI_RECOVERY_OUTPUT_NOT_OWNED/);assert.equal(await fs.readFile(path.join(outputDir,'foreign.txt'),'utf8'),'keep');
 writeRecoveryCheckpoint({artifactDir,outputDir,game,lastOwnedTabIds:[],exportStarted:true});const exported=await recoverLiveEvidence({artifactDir,outputDir,gameId:game.id});assert.equal(exported.recovered,true);
 const staging=(await fs.readdir(artifactDir)).find(name=>name.startsWith('incomplete-export-'));assert.equal(await fs.readFile(path.join(artifactDir,staging,'foreign.txt'),'utf8'),'keep');
 await assert.rejects(recoverLiveEvidence({artifactDir,outputDir:path.join(root,'elsewhere'),gameId:game.id}),/CI_RECOVERY_OUTPUT_MISMATCH/);
 assert.throws(()=>writeRecoveryCheckpoint({artifactDir,outputDir,game,observedResult:{padding:'x'.repeat(17*1024*1024)}}),/CI_RECOVERY_CHECKPOINT_TOO_LARGE/);
 const alias=path.join(root,'alias');await fs.symlink(artifactDir,alias);
 assert.throws(()=>writeRecoveryCheckpoint({artifactDir,outputDir:path.join(alias,'export'),game}),/CI_RECOVERY_DIRECTORIES_OVERLAP/);
 await fs.unlink(path.join(artifactDir,'recovery.json'));await fs.symlink(path.join(outputDir,'result.json'),path.join(artifactDir,'recovery.json'));
 await assert.rejects(recoverLiveEvidence({artifactDir,outputDir,gameId:game.id}),/CI_RECOVERY_CHECKPOINT_UNSAFE/);
}));
