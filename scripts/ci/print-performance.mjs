import fs from 'node:fs/promises';import path from 'node:path';
const file=path.join(process.env.FUZZER_OUTPUT_DIR,'performance.json');
try{
 const p=JSON.parse(await fs.readFile(file,'utf8'));
 const rows=p.stages.slice(0,18).map(s=>`| ${s.name} | ${s.count} | ${s.totalMs.toFixed(1)} | ${s.selfMs.toFixed(1)} | ${s.p50Ms?.toFixed(1)} | ${s.p95Ms?.toFixed(1)} | ${s.maxMs.toFixed(1)} |`);
 const text=`## Performance: ${p.mode}\n\nElapsed: ${p.elapsedMs.toFixed(1)} ms. Process CPU: ${p.processCpuMs.toFixed(1)} ms.\n\n| Phase | Calls | Inclusive ms | Self ms | p50 ms | p95 ms | Max ms |\n|---|---:|---:|---:|---:|---:|---:|\n${rows.join('\n')}\n\nSelf time excludes direct child overlap; concurrent siblings must not be added as elapsed time. Percentiles use two significant figures. Trace events omitted: ${p.droppedEvents}.\n`;
 if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,text);
 console.log('FUZZER_PERFORMANCE_TABLE\n'+text);
}catch(error){if(error.code==='ENOENT')console.log('BENCHMARK_UNAVAILABLE: inspect runner and progress logs');else throw error;}
