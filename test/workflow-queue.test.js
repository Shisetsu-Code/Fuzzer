import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
for(const file of ['pragmatic-new5.yml','performance.yml','control-audit.yml'])test(`${file} preserves queued DEMO runs as well as active runs`,()=>{
 const yaml=fs.readFileSync(new URL('../.github/workflows/'+file,import.meta.url),'utf8');
 const block=yaml.match(/^concurrency:\n((?:[ \t].*\n|\n)+)/m)?.[1];
 assert.match(block||'',/group: pragmatic-live-demos/);assert.match(block||'',/cancel-in-progress: false/);assert.match(block||'',/queue: max/);
});
