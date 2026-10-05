import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const fixture=fileURLToPath(new URL('./fixtures/state-explorer-integration-runner.mjs',import.meta.url));
const scenarios=[
 ['delayed-purchase','the real adapter anchors a delayed purchase and verifies one fresh normal spin'],
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
