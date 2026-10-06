import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {exportLiveEvidence} from '../scripts/ci/export-live-evidence.mjs';
test('live summaries distinguish repeated valid attempts from recovered logical routes',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'route-export-'));try{
  const artifactDir=path.join(temp,'private');await fs.mkdir(artifactDir);
  const recovery={maxRetries:2,routeAttempts:3,retries:1,discoveredRoutes:2,validRoutes:2,resolvedRoutes:2,recoveredRoutes:1,blockedRoutes:0,deferredRoutes:0};
  const result={status:'EXHAUSTED_OBSERVED_CONTROLS',stopReason:'EXHAUSTED_OBSERVED_CONTROLS',nodes:[],pending:[],queued:[],actions:3,attemptedActions:3,recovery,edges:[{routeId:'A',validity:{valid:true}},{routeId:'A',validity:{valid:true}},{routeId:'B',validity:{valid:true}}]};
  const out=await exportLiveEvidence({game:{id:'probe',title:'Probe',url:'https://www.pragmaticplay.fun/en/slots/probe/'},result,artifactDir,outputDir:path.join(temp,'public')});
  assert.equal(out.summary.validActionCount,3);assert.equal(out.summary.validRouteCount,2);
  assert.deepEqual(out.summary.recovery,recovery);assert.equal(out.summary.stopReason,'EXHAUSTED_OBSERVED_CONTROLS');assert.equal(out.summary.completeGame,false);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
