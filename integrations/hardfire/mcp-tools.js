import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {createHardFireSession} from './session.js';
import {assertDemoUrl} from '../../providers/pragmatic/session.js';
import {runPragmatic,compareEconomics} from '../../providers/pragmatic/flow.js';
import {createDecisionGraph,familyHints,linkEconomics} from '../../providers/pragmatic/graph.js';
const jobs=new Map();
export function registerFuzzerTools({register,z,text,controller,sessionFactory=createHardFireSession,artifactDir=path.join(os.homedir(),'.hardfire','fuzzer')}){
 register('pragmatic_fuzz_start','Run the independent Pragmatic Fuzzer on new isolated DEMO tabs using the selected tab public launcher. Discover nested purchases/choices, compare bet variables and capture real payloads. Returns job_id immediately; never repeat start to poll.',{
   tab_id:z.number().int().positive(),game_url:z.string().url().optional(),execute:z.boolean().default(false),
   max_branches:z.number().int().min(1).max(1000).optional(),max_steps:z.number().int().min(1).max(200).default(100),timeout_ms:z.number().int().min(1000).max(600000).default(180000)
 },false,async args=>{
   if([...jobs.values()].some(j=>j.status==='RUNNING'))throw new Error('A Pragmatic Fuzzer job is already running');
   const tab=controller.tabs.resolve(args.tab_id);const gameUrl=assertDemoUrl(args.game_url||controller._wc(tab).getURL());
   if(jobs.size>=50){const old=[...jobs.entries()].find(([,j])=>j.status!=='RUNNING');if(old)jobs.delete(old[0]);}
   const id=randomUUID(),job={job_id:id,status:'RUNNING',source_tab_id:args.tab_id,execute:args.execute};jobs.set(id,job);
   void (async()=>{
     let session;
     try{
       session=await sessionFactory(controller,{gameUrl});
       const discovery=await session.observe();const betProbe=await session.probeBet();
       const comparison=betProbe.after?compareEconomics(betProbe.before,betProbe.after):null;
       const result=args.execute&&betProbe.restored&&betProbe.status==='OBSERVED'?await runPragmatic(session,{maxBranches:args.max_branches,maxSteps:args.max_steps,timeoutMs:args.timeout_ms}):{provider:'pragmatic',status:betProbe.status==='OBSERVED'&&!args.execute?'DISCOVERED':'PARTIAL',reason:args.execute&&!betProbe.restored?'BET_NOT_RESTORED':betProbe.reason,inventory:discovery.options,inventoryKnown:discovery.inventoryKnown};
       if(!result.buyFeaturePresence)result.buyFeaturePresence=discovery.inventoryKnown===true?(discovery.options.some(o=>o.kind==='buy')?'PRESENT':'ABSENT'):'UNKNOWN';
       result.betProbe=betProbe;result.priceComparison=comparison;result.source_tab_id=args.tab_id;
       result.gameUrl=gameUrl;
       if(!result.graph){const graph=createDecisionGraph();graph.observe([],discovery);result.graph=graph.export();result.coverage={rootInventoryKnown:discovery.inventoryKnown===true,rootPurchasesDiscovered:discovery.options.filter(o=>o.kind==='buy').length,branchesExecuted:0,graphComplete:false};result.familyHints=familyHints(result);}
       if(result.status==='COMPLETE'&&betProbe.status!=='OBSERVED'){result.status='PARTIAL';result.reason='BET_PROBE_PENDING';}
       linkEconomics(result);
       if(result.coverage){result.coverage.graphComplete=result.status==='COMPLETE';result.familyHints=familyHints(result);}
       job.result=result;
     }catch(error){job.status='ERROR';job.error=String(error.message).slice(0,300);}
     finally{
       try{await session?.close();job.har=session?.har;}catch(error){job.status='PARTIAL';job.cleanupError=String(error.message).slice(0,200);}
       if(job.status==='RUNNING')job.status=job.result?.status||'ERROR';
       try{await fs.mkdir(artifactDir,{recursive:true});job.artifact=path.join(artifactDir,id+'.json');await fs.writeFile(job.artifact,JSON.stringify(job,null,2));}catch{job.artifactError='Could not save local contract';}
     }
   })();return text({job_id:id,status:'RUNNING',source_tab_id:args.tab_id});
 });
 register('pragmatic_fuzz_result','Read an existing Fuzzer job without repeating any purchase. Full contract stays local; page branches with offset/limit.',{
   job_id:z.string().uuid(),offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(5).default(2),graph_offset:z.number().int().min(0).default(0),graph_limit:z.number().int().min(1).max(100).default(50)
 },true,async args=>{
   const job=jobs.get(args.job_id);if(!job)throw new Error('Unknown job_id; jobs survive only this MCP process');
   const result=job.result?{...job.result,tree:job.result.tree?.slice(args.offset,args.offset+args.limit)}:undefined;
   if(result?.betProbe)result.betProbe={...result.betProbe,before:{bet:result.betProbe.before?.bet,options:result.betProbe.before?.options},after:{bet:result.betProbe.after?.bet,options:result.betProbe.after?.options},snapshots:result.betProbe.snapshots?.map(s=>({bet:s.bet,betSource:s.betSource,options:s.options}))};
   if(result?.graph){const graph=job.result.graph;const nodes=graph.nodes.slice(args.graph_offset,args.graph_offset+args.graph_limit),ids=new Set(nodes.map(n=>n.id));result.graph={...graph,nodes,edges:graph.edges.filter(e=>ids.has(e.to)),total_nodes:graph.nodes.length,next_offset:args.graph_offset+args.graph_limit<graph.nodes.length?args.graph_offset+args.graph_limit:null};}
   const total=job.result?.tree?.length||0;
   return text({...job,result,next_offset:args.offset+args.limit<total?args.offset+args.limit:null});
 });
}
