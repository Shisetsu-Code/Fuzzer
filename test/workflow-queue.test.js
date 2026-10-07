import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
for(const file of ['pragmatic-new5.yml','performance.yml','control-audit.yml','control-followup.yml'])test(`${file} preserves queued DEMO runs as well as active runs`,()=>{
 const yaml=fs.readFileSync(new URL('../.github/workflows/'+file,import.meta.url),'utf8');
 // Exercise both checkout formats on every OS; CRLF cannot hide concurrency.
 for(const source of [yaml.replace(/\r\n/g,'\n'),yaml.replace(/\r\n/g,'\n').replace(/\n/g,'\r\n')]){
 const block=source.replace(/\r\n/g,'\n').match(/^concurrency:\n((?:[ \t].*\n|\n)+)/m)?.[1];
 assert.match(block||'',/group: pragmatic-live-demos/);assert.match(block||'',/cancel-in-progress: false/);assert.match(block||'',/queue: max/);
 }
});
