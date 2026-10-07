import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const game={id:'sample',title:'Sample',url:'https://www.pragmaticplay.fun/en/slots/sample/'};
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'live-evidence-'));const artifactDir=path.join(root,'private'),outputDir=path.join(root,'export');await fs.mkdir(artifactDir);try{const {exportLiveEvidence}=await import('../scripts/ci/export-live-evidence.mjs');return await fn({root,artifactDir,outputDir,exportLiveEvidence});}finally{await fs.rm(root,{recursive:true,force:true});}}
test('summary preserves bounded wager scope and sampled values without claiming all amounts',()=>fixture(async({artifactDir,outputDir,exportLiveEvidence})=>{
 const result={status:'EXHAUSTED_OBSERVED_CONTROLS',nodes:[{wager:{betAmount:2,betSource:'runtime:TotalBetDisplayed.GetDouble'},excludedControls:[{reason:'sound'},{reason:'base_bet'}]},{wager:{betAmount:3,betSource:'runtime:TotalBetDisplayed.GetDouble'}}],edges:[{configurationChange:{direction:'increase',before:2,after:3}}],pending:[],coverage:{wagerSampling:'one-step-per-route',maxWagerStepsPerRoute:1,allAmountsTested:false,scopeOmissions:[{reason:'WAGER_SAMPLING_LIMIT'}]}};
 const out=await exportLiveEvidence({game,result,artifactDir,outputDir});
 assert.equal(out.summary.coverage?.allAmountsTested,false);
 assert.deepEqual(out.summary.coverage.sampledAmounts,[2,3]);
 assert.equal(out.summary.configurationChangeCount,1);assert.equal(out.summary.excludedControlReasons.sound,1);
}));
