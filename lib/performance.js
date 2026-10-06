import {AsyncLocalStorage} from 'node:async_hooks';
import {performance,createHistogram} from 'node:perf_hooks';

const context = new AsyncLocalStorage();
const round = n => Math.round(n * 1000) / 1000;
const nameOf = name => typeof name === 'string' && /^[a-z][a-z0-9_.-]{0,63}$/.test(name) ? name : 'unlabeled';

/** Process-local, bounded profiler. No URLs, arguments, results or error strings. */
export function createBenchmark({now=()=>performance.now(),maxEvents=1024,maxStages=96}={}) {
  if(!Number.isInteger(maxEvents)||maxEvents<0||maxEvents>4096||!Number.isInteger(maxStages)||maxStages<1||maxStages>128) throw Error('INVALID_BENCHMARK_LIMIT');
  const started=now(),cpu=process.cpuUsage(),stages=new Map(),active=new Map(),trace=[];
  let nextId=1,droppedEvents=0;
  function begin(label,parent) {
    let name=nameOf(label);if(!stages.has(name)&&stages.size>=maxStages)name='other';
    if(!stages.has(name))stages.set(name,{name,count:0,errors:0,totalMs:0,selfMs:0,maxMs:0,histogram:createHistogram({lowest:1,highest:3600000000,figures:2})});
    const start=now(),id=nextId++,span={id,name,start,children:0,childSince:null,childMs:0,ended:false};
    if(parent&&!parent.ended){if(parent.children++===0)parent.childSince=start;}
    active.set(id,span);
    span.end = (error=false) => {
      if(span.ended)return;span.ended=true;const end=now();
      const duration=Math.max(0,end-start),children=span.childMs+(span.children?Math.max(0,end-span.childSince):0),self=Math.max(0,duration-children);
      const row=stages.get(name);row.count++;row.errors+=Number(error);row.totalMs+=duration;row.selfMs+=self;row.maxMs=Math.max(row.maxMs,duration);
      row.histogram.record(Math.max(1,Math.min(3600000000,Math.round(duration*1000))));
      if(parent&&!parent.ended&&--parent.children===0){parent.childMs+=Math.max(0,end-parent.childSince);parent.childSince=null;}
      active.delete(id);
      if(trace.length<maxEvents)trace.push({id,parentId:parent?.id??null,name,startMs:round(start-started),durationMs:round(duration),selfMs:round(self),status:error?'error':'ok'});else droppedEvents++;
    };
    return span;
  }
  function report({includeTrace=true}={}) {
    const current=now(),used=process.cpuUsage(cpu);
    return {schema:'fuzzer/performance/v1',clock:'monotonic',elapsedMs:round(Math.max(0,current-started)),processCpuMs:round((used.user+used.system)/1000),rssBytes:process.memoryUsage().rss,
      percentilePrecision:'2 significant figures; all completed samples',selfTimeDefinition:'inclusive minus union of direct child spans; parallel siblings may overlap',
      stages:[...stages.values()].map(({histogram,...row})=>({...row,totalMs:round(row.totalMs),selfMs:round(row.selfMs),maxMs:round(row.maxMs),meanMs:row.count?round(row.totalMs/row.count):0,p50Ms:row.count?round(histogram.percentile(50)/1000):null,p95Ms:row.count?round(histogram.percentile(95)/1000):null})).sort((a,b)=>b.selfMs-a.selfMs),
      active:[...active.values()].slice(0,64).map(s=>({id:s.id,name:s.name,ageMs:round(Math.max(0,current-s.start))})),droppedEvents,
      ...(includeTrace?{trace:trace.map(s=>({...s}))}:{})};
  }
  return {begin,report};
}

export function withBenchmark(benchmark,fn,{mode='sequential'}={}) {
  if(!['sequential','parallel'].includes(mode))throw Error('INVALID_PERFORMANCE_MODE');
  return context.run({benchmark,mode,span:null},fn);
}
export function benchmarkMode(){return context.getStore()?.mode??'sequential';}
export function benchmarkSnapshot(options){return context.getStore()?.benchmark?.report(options)??null;}

/** Supports synchronous and asynchronous substeps without changing their result. */
export function measure(name,fn) {
  const state=context.getStore();if(!state?.benchmark)return fn();
  const span=state.benchmark.begin(name,state.span);
  return context.run({...state,span},()=>{
    try {
      const result=fn();
      if(result&&typeof result.then==='function')return Promise.resolve(result).then(value=>{span.end();return value;},error=>{span.end(true);throw error;});
      span.end();return result;
    } catch(error){span.end(true);throw error;}
  });
}

/** Wait for all started siblings on failure before releasing any caller's lock. */
export async function mapConcurrent(items,fn,{concurrency=4}={}) {
  if(!Array.isArray(items)||!Number.isInteger(concurrency)||concurrency<1||concurrency>8)throw Error('INVALID_CONCURRENCY');
  const results=new Array(items.length),errors=[];let next=0,failed=false;
  async function worker(){
    while(!failed&&next<items.length){const index=next++;try{results[index]=await fn(items[index],index);}catch(error){failed=true;errors.push({index,error});}}
  }
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},worker));
  if(errors.length)throw errors.sort((a,b)=>a.index-b.index)[0].error;
  return results;
}
export function independent(tasks){return mapConcurrent(tasks,task=>task(),{concurrency:benchmarkMode()==='parallel'?4:1});}
