import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {createBenchmark,withBenchmark,measure,independent} from '../lib/performance.js';

// Controlled scheduling/IO benchmark, not a surrogate for live game throughput.
const output=process.argv[2]||'outputs/performance/microbenchmark.json';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-bench-'));
const results=[];
try{
 for(let repeat=0;repeat<6;repeat++){
  for(const mode of repeat%2?['parallel','sequential']:['sequential','parallel']){
   const dir=path.join(root,`${repeat}-${mode}`);await fs.mkdir(dir);
   const benchmark=createBenchmark(),payload=Buffer.alloc(64*1024,repeat),start=performance.now();
   const values=await withBenchmark(benchmark,()=>measure('benchmark.iteration',async()=>{
    // Known latency isolates the benefit and overhead of the scheduling helper.
    const reads=await measure('benchmark.controlled-reads',()=>independent(Array.from({length:4},(_,i)=>()=>measure('benchmark.read',()=>new Promise(resolve=>setTimeout(()=>resolve(i),10))))));
    await measure('benchmark.real-file-writes',()=>independent(Array.from({length:24},(_,i)=>()=>measure('benchmark.file-write',()=>fs.writeFile(path.join(dir,i+'.bin'),payload)))));
    return reads;
   }),{mode});
   const elapsedMs=performance.now()-start;
   if(JSON.stringify(values)!=='[0,1,2,3]')throw Error('BENCHMARK_RESULT_ORDER');
   const expected=createHash('sha256').update(payload).digest('hex');
   for(let i=0;i<24;i++)if(createHash('sha256').update(await fs.readFile(path.join(dir,i+'.bin'))).digest('hex')!==expected)throw Error('BENCHMARK_WRITE_MISMATCH');
   results.push({mode,repeat,warmup:repeat===0,elapsedMs,report:benchmark.report({includeTrace:false})});
  }
 }
 const median=xs=>{xs=[...xs].sort((a,b)=>a-b);return xs[Math.floor(xs.length/2)];};
 const modes=Object.fromEntries(['sequential','parallel'].map(mode=>{const samples=results.filter(r=>r.mode===mode&&!r.warmup);return [mode,{samples:samples.length,medianMs:median(samples.map(r=>r.elapsedMs)),minMs:Math.min(...samples.map(r=>r.elapsedMs)),maxMs:Math.max(...samples.map(r=>r.elapsedMs))}];}));
 const report={schema:'fuzzer/microbenchmark/v1',scope:'Four controlled 10ms waits plus 24 real 64KiB file writes; not a game or renderer benchmark',node:process.version,platform:process.platform,verifiedEquivalent:true,modes,ratio:modes.sequential.medianMs/modes.parallel.medianMs,results};
 await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2));
 console.log('FUZZER_MICROBENCHMARK_JSON='+JSON.stringify({...report,results:undefined}));
}finally{await fs.rm(root,{recursive:true,force:true});}
