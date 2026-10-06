import test from 'node:test';
import assert from 'node:assert/strict';

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
