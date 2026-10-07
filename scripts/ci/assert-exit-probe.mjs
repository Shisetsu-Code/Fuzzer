import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function assertExitProbeResult(result){
 assert.equal(result.execution?.live,true,'A simulated or skipped run is not live evidence');
 assert.equal(result.cleanupPending,false,'Owned sessions must be confirmed closed');
 const verified=(result.edges||[]).filter(({operation:o})=>o?.ok===true&&
  o.closureEvidence?.basis==='OBSERVED_NORMAL_SPIN'&&o.verification?.kind==='spin'&&
  o.verification.sequence===o.closureEvidence.sequence&&o.verification.complete===true&&
  o.verification.status===200&&o.verification.protocolAccepted===true&&o.verification.payload?.action==='doSpin');
 assert.ok(verified.length,'No bonus closure proved by an accepted observed spin');
 return verified.length;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=JSON.parse(fs.readFileSync(path.join(process.env.FUZZER_OUTPUT_DIR,'result.json'),'utf8'));
 console.log('FUZZER_OBSERVED_EXIT_PROOFS='+assertExitProbeResult(result));
}
