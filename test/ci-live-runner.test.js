import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {exploreStates} from '../providers/pragmatic/state-explorer.js';

test('live runner selects exactly the requested manifest game and caps its budget',async()=>{
 const {readRunConfig,selectManifestGame}=await import('../scripts/ci/run-live-demo.mjs');
 const config=readRunConfig({HARDFIRE_ROOT:'/hardfire',FUZZER_GAME_ID:'new-game',FUZZER_ARTIFACT_DIR:'/private',FUZZER_OUTPUT_DIR:'/public'});
 assert.equal(config.maxActions,100);assert.equal(config.maxDepth,8);assert.equal(config.timeoutMs,1200000);
 assert.equal(selectManifestGame({games:[{id:'new-game',title:'New Game',url:'https://www.pragmaticplay.com/en/games/new-game/'}]},config.gameId).title,'New Game');
 assert.throws(()=>selectManifestGame({games:[{id:'other'}]},config.gameId),/CI_GAME_NOT_FOUND/);
 assert.throws(()=>readRunConfig({...config,HARDFIRE_ROOT:'/hardfire',FUZZER_GAME_ID:'new-game',FUZZER_ARTIFACT_DIR:'/private',FUZZER_OUTPUT_DIR:'/public',FUZZER_TIMEOUT_MS:'999999999'}),/CI_INVALID_TIMEOUT/);
});

test('live runner rejects ambiguous identities and unsafe overlapping evidence directories',async()=>{
 const {readRunConfig,selectManifestGame}=await import('../scripts/ci/run-live-demo.mjs');
 assert.throws(()=>selectManifestGame([{id:'same'},{id:'same'}],'same'),/CI_GAME_AMBIGUOUS/);
 assert.throws(()=>readRunConfig({HARDFIRE_ROOT:'/hardfire',FUZZER_GAME_ID:'new-game',FUZZER_ARTIFACT_DIR:'/private',FUZZER_OUTPUT_DIR:'/private/export'}),/CI_EVIDENCE_DIRECTORIES_OVERLAP/);
});

test('Electron flags before the entry file still start the runner, while an imported module stays inert',async()=>{
 const {isRunnerEntry}=await import('../scripts/ci/run-live-demo.mjs');
 const entry=pathToFileURL('/repo/scripts/ci/run-live-demo.mjs').href;
 assert.equal(isRunnerEntry(['/electron','--no-sandbox','--use-gl=angle','--use-angle=swiftshader','/repo/scripts/ci/run-live-demo.mjs'],entry),true);
 assert.equal(isRunnerEntry(['/node','/repo/scripts/ci/run-live-demo.mjs'],entry),true);
 assert.equal(isRunnerEntry(['/electron','--no-sandbox','/repo/diagnostic.mjs','/repo/scripts/ci/run-live-demo.mjs'],entry),false);
 assert.equal(isRunnerEntry(['/electron','-r','/repo/scripts/ci/run-live-demo.mjs','/repo/diagnostic.mjs'],entry),false);
});

test('budget recovery retains a completed purchase checkpoint without certifying the later in-flight action',async()=>{
 const {createProgressCheckpoint}=await import('../scripts/ci/run-live-demo.mjs');
 assert.equal(typeof createProgressCheckpoint,'function');
 const checkpoint=createProgressCheckpoint();let action,releaseSecond,secondStarted,rawProgress;
 const inFlight=new Promise(resolve=>{secondStarted=resolve;});
 const snapshot=()=>({key:'root',controls:[{key:'buy'},{key:'unfinished'}],operation:{sequence:action==='buy'?1:0}});
 const adapter={reset:async()=>{action=null;},snapshot:async()=>snapshot(),click:async control=>{action=control.key;},operationStarted:()=>action==='buy',finishOperation:async()=>({ok:true,kind:'purchase',normalSpinVerified:true,submission:{kind:'purchase',sequence:1,payload:{pur:'0'}},verification:{kind:'spin',sequence:2,status:200,complete:true},snapshot:snapshot()})};
 const run=exploreStates(adapter,{maxActions:2,wait:async()=>{
  if(action==='buy')return {snapshot:snapshot(),reason:'OPERATION_STARTED'};
  secondStarted();return new Promise(resolve=>{releaseSecond=()=>resolve({snapshot:snapshot(),reason:'ACTIVE_TIMEOUT'});});
 },onProgress:async progress=>{rawProgress=progress;checkpoint.record(progress);}});
 await inFlight;
 const budgetError=new Error('CI_FINAL_BUDGET_EXCEEDED');
 await assert.rejects(Promise.race([run,Promise.reject(budgetError)]),/CI_FINAL_BUDGET_EXCEEDED/);
 const recovered=checkpoint.recover(budgetError);
 assert.equal(recovered.status,'PARTIAL');assert.equal(recovered.actions,1);assert.equal(recovered.completeGame,false);
 assert.equal(recovered.edges.length,1);assert.equal(recovered.edges[0].operation.normalSpinVerified,true);assert.equal(recovered.edges[0].operation.submission.payload.pur,'0');
 assert.deepEqual(recovered.pending,[{phase:'runner',reason:'CI_FINAL_BUDGET_EXCEEDED'}]);assert.equal(recovered.nodes.length,1);
 rawProgress.edges[0].operation.normalSpinVerified=false;rawProgress.pending.push({reason:'late mutation'});
 assert.equal(checkpoint.recover(budgetError).edges[0].operation.normalSpinVerified,true);
 releaseSecond();await run;
 assert.equal(recovered.edges.length,1,'late engine work cannot mutate the exported checkpoint');assert.equal(recovered.actions,1);
});

test('no checkpoint cannot manufacture an explored game result',async()=>{
 const {createProgressCheckpoint}=await import('../scripts/ci/run-live-demo.mjs');
 assert.equal(typeof createProgressCheckpoint,'function');assert.equal(createProgressCheckpoint().recover(new Error('CI_FINAL_BUDGET_EXCEEDED')),null);
});

test('watchdog checkpoint recovery reports a real cleanup failure and retained tabs in the published summary',async()=>{
 const {createProgressCheckpoint}=await import('../scripts/ci/run-live-demo.mjs');
 const {exportLiveEvidence}=await import('../scripts/ci/export-live-evidence.mjs');
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ci-retained-checkpoint-'));
 try{
  const artifactDir=path.join(root,'private'),outputDir=path.join(root,'export');await fs.mkdir(artifactDir);
  const checkpoint=createProgressCheckpoint();checkpoint.record({actions:1,nodes:[],edges:[],pending:[]});
  const failure={cleanupPending:true,cleanupError:'CI_CLOSE_UNCONFIRMED',retainedTabIds:[42]};
  const recovered=checkpoint.recover(new Error('CI_FINAL_BUDGET_EXCEEDED'),failure);
  assert.equal(recovered.cleanupPending,true);assert.equal(recovered.cleanupError,'CI_CLOSE_UNCONFIRMED');assert.deepEqual(recovered.retainedTabIds,[42]);
  failure.retainedTabIds.push(99);assert.deepEqual(recovered.retainedTabIds,[42]);
  const exported=await exportLiveEvidence({game:{id:'demo',title:'Demo',url:'https://www.pragmaticplay.fun/en/slots/demo/'},result:recovered,artifactDir,outputDir});
  assert.equal(exported.summary.cleanupPending,true);assert.equal(JSON.parse(await fs.readFile(exported.summaryPath,'utf8')).cleanupPending,true);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
