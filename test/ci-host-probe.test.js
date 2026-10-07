import test from 'node:test';
import assert from 'node:assert/strict';

test('host probe loads only about:blank before the real runtime in the comparison variant',async()=>{
 const {createProbeRuntime}=await import('../scripts/ci/probe-hardfire-host.mjs');
 const calls=[],wc={ready:false,async loadURL(url){assert.equal(url,'about:blank');this.ready=true;calls.push('blank');}};
 class Runtime{constructor(webContents){this.webContents=webContents;}async start(){assert.equal(this.webContents.ready,true);calls.push('runtime');}}
 const Probe=createProbeRuntime(Runtime,{order:'blank-first',emit:()=>{},timeoutMs:20});await new Probe(wc).start();assert.deepEqual(calls,['blank','runtime']);
});

test('host probe keeps the original order and records a timeout before cleanup can crash',async()=>{
 const {createProbeRuntime}=await import('../scripts/ci/probe-hardfire-host.mjs');
 const events=[],wc={async loadURL(){throw Error('Baseline must not navigate first');}};
 class Runtime{constructor(webContents){this.webContents=webContents;}async start(){return new Promise(()=>{});}}
 const Probe=createProbeRuntime(Runtime,{order:'current',emit:event=>events.push(event),timeoutMs:5});
 await assert.rejects(new Probe(wc).start(),/CI_PROBE_PHASE_TIMEOUT/);
 assert.ok(events.some(event=>event.phase==='runtime_start'&&event.status==='timeout'));
});
