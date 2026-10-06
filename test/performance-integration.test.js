import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const fixture=fileURLToPath(new URL('./fixtures/state-explorer-integration-runner.mjs',import.meta.url));
for(const mode of ['sequential','parallel'])for(const scenario of ['action-capture','action-probe','action-snapshot-race','verification-no-request','verification-body-pending','reset-failure','final-failure'])test(`profiled ${mode} preserves ${scenario}`,()=>{
 const child=spawnSync(process.execPath,['--experimental-test-module-mocks',fixture,scenario],{encoding:'utf8',timeout:10000,env:{...process.env,PERF_MODE:mode,PERF_TEST:'1'}});
 assert.equal(child.status,0,child.stderr||child.stdout||String(child.error));const result=JSON.parse(child.stdout.trim().split('\n').at(-1));assert.equal(result.scenario,scenario);
});
