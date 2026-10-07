import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const fixture=fileURLToPath(new URL('./fixtures/state-explorer-integration-runner.mjs',import.meta.url));
const scenarios=[
 ['action-v2-menu','the adapter follows V2 confirmation controls despite a false legacy open flag'],
 ['action-wager-race','an amount changed without network invalidates the pre-click wager guard'],
 ['action-generic-choice','the real adapter clicks unnamed observed bonus decisions and queues siblings'],
 ['action-disabled-control','fresh disabled controls cannot be dispatched'],
 ['action-uncertain-capture','uncertainty appearing during pre-click capture cannot authorize a click'],
 ['action-capture','action mode captures an accepted operation without an extra verification spin'],
 ['action-probe','action mode uses exactly one probe without requiring an ante classification'],
 ['delayed-purchase','the real adapter anchors a delayed purchase and verifies one fresh normal spin'],
 ['normal-flags-overlay','normal flags do not bypass an observed continuation before one verification spin'],
 ['verification-no-request','an accepted verification click without a request stays pending with diagnostics and no duplicate'],
 ['verification-click-error','an uncertain verification click is recorded once and never retried'],
 ['verification-race','a fresh request before verification capture cannot stand in for the one verification click'],
 ['verification-nonspin-race','a pending non-spin request arriving before verification prevents the normal click'],
 ['verification-response-race','a changed response body with the same request counts prevents the normal click'],
 ['verification-cascade-race','a cascade arriving in the same response prevents the normal click'],
 ['verification-body-pending','an unfinished response body with the same request counts prevents the normal click'],
 ['hitless','the real adapter reports a visible control without a hit rectangle as pending'],
 ['reset-failure','failed reset cleanup preserves the graph and stops new session creation'],
 ['reset-recovered','confirmed final cleanup releases ownership without restarting failed exploration'],
 ['final-failure','failed final cleanup changes the result to PARTIAL and retains ownership'],
 ['observation-failure','failed observation preserves its original error and retained cleanup ownership']
];
for(const [scenario,name]of scenarios)test(name,()=>{
 const child=spawnSync(process.execPath,['--experimental-test-module-mocks',fixture,scenario],{encoding:'utf8',timeout:5000});
 assert.equal(child.status,0,child.stderr||child.stdout||String(child.error));
 const evidence=JSON.parse(child.stdout);
 assert.equal(evidence.scenario,scenario);
 assert(evidence.wallMs<2000,'the deterministic clock must avoid real transition waits');
});


test('the real adapter continues three campaign slices and consolidates every session HAR',()=>{
 const fixture=fileURLToPath(new URL('./fixtures/campaign-integration-runner.mjs',import.meta.url));
 const child=spawnSync(process.execPath,['--experimental-test-module-mocks',fixture],{encoding:'utf8',timeout:5000});
 assert.equal(child.status,0,child.stderr||child.stdout||String(child.error));
 assert.deepEqual(JSON.parse(child.stdout),{scenario:'campaign',creates:3,closes:3,actions:3,slices:3,harEntries:3});
});
