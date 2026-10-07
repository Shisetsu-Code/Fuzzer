import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../scripts/ci/assert-exit-probe.mjs').catch(()=>({}));
const proof=()=>({cleanupPending:false,execution:{live:true},edges:[{operation:{ok:true,closureEvidence:{basis:'OBSERVED_NORMAL_SPIN',sequence:2},verification:{sequence:2,kind:'spin',complete:true,status:200,protocolAccepted:true,payload:{action:'doSpin'}}}}]});
test('the directed live gate requires actual probe proof, not a green workflow or visible button',()=>{
 assert.equal(typeof api.assertExitProbeResult,'function');
 assert.equal(api.assertExitProbeResult(proof()),1);
 for(const r of [{...proof(),edges:[]},{...proof(),cleanupPending:true},{...proof(),execution:{live:false}}])assert.throws(()=>api.assertExitProbeResult(r));
 const rejected=proof();rejected.edges[0].operation.verification.protocolAccepted=false;assert.throws(()=>api.assertExitProbeResult(rejected));
});
