import {performance} from 'node:perf_hooks';
import {HarStore,listEntries} from '../har/store.js';
import {analyzeFeatures} from '../har/features.js';
import {boundedOutput} from '../integrations/har-mcp/tools.js';

if(process.argv.length!==3){console.error('Usage: npm run har -- "PATH_TO_CAPTURE.har"');process.exitCode=1;}
else{
 try{
  const store=new HarStore(),start=performance.now(),summary=await store.open(process.argv[2]),loaded=performance.now(),capture=store.get(summary.har_id),entries=listEntries(capture,{limit:10}),queried=performance.now(),features=analyzeFeatures(capture),finished=performance.now();
  console.log(JSON.stringify(boundedOutput({summary,entries,features,timing_ms:{load:Math.round(loaded-start),query:Math.round(queried-loaded),features:Math.round(finished-queried)}}),null,2));store.close(summary.har_id);
 }catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'HAR_ANALYSIS_FAILED');process.exitCode=1;}
}
